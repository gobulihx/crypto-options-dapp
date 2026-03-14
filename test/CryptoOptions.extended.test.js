const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CryptoOptions — Extended Tests", function () {

  const CALL = 0;
  const PUT = 1;
  const ONE_DAY = 86400;
  const ONE_ETH = ethers.parseEther("1");
  const PREMIUM = ethers.parseEther("0.05");

  let optionsContract, mockPriceFeed;
  let seller, buyer, other;
  let expiry;

  beforeEach(async function () {
    [seller, buyer, other] = await ethers.getSigners();

    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    mockPriceFeed = await MockV3Aggregator.deploy(8, 2000_00000000n);

    const CryptoOptions = await ethers.getContractFactory("CryptoOptions");
    optionsContract = await CryptoOptions.deploy(await mockPriceFeed.getAddress());

    const latest = await time.latest();
    expiry = latest + ONE_DAY;
  });

  // --- Helpers ---

  // Same logic as frontend/src/utils/format.js estimatePayoff
  function frontendEstimatePayoff(optionType, strikePrice, collateral, marketPrice) {
    const mktNum = Number(marketPrice);
    const strikeNum = Number(strikePrice);
    const collateralETH = Number(ethers.formatEther(collateral));

    if (mktNum <= 0) return 0;

    let priceDiff = 0;
    if (optionType === CALL) {
      if (mktNum <= strikeNum) return 0;
      priceDiff = mktNum - strikeNum;
    } else {
      if (mktNum >= strikeNum) return 0;
      priceDiff = strikeNum - mktNum;
    }

    let payoffETH = priceDiff / mktNum;
    if (payoffETH > collateralETH) payoffETH = collateralETH;
    return payoffETH;
  }

  // Same logic as contract _calculatePayoff + cap, in BigInt
  function contractPayoff(optionType, strikePrice, collateral, marketPrice) {
    let priceDiff;
    if (optionType === CALL) {
      if (marketPrice <= strikePrice) return 0n;
      priceDiff = marketPrice - strikePrice;
    } else {
      if (marketPrice >= strikePrice) return 0n;
      priceDiff = strikePrice - marketPrice;
    }

    let payoff = (priceDiff * BigInt(1e18)) / marketPrice;
    if (payoff > collateral) payoff = collateral;
    return payoff;
  }

  // Same logic as Portfolio.js summary calculation
  function calculateNetPnL(optionsList, account, ethPrice) {
    let totalNetPnL = 0;
    const addr = account.toLowerCase();

    optionsList.forEach(({ data }) => {
      const isSeller = data.seller.toLowerCase() === addr;
      const isBuyer = data.buyer !== ethers.ZeroAddress && data.buyer.toLowerCase() === addr;
      if (!isSeller && !isBuyer) return;

      const state = Number(data.state);
      if (state !== 1) return;

      const payoffETH = frontendEstimatePayoff(
        Number(data.optionType), data.strikePrice, data.collateral, ethPrice
      );
      const collateralNum = Number(ethers.formatEther(data.collateral));
      const premiumNum = Number(ethers.formatEther(data.premium));
      const cappedPayoff = Math.min(payoffETH, collateralNum);

      if (isBuyer) totalNetPnL += cappedPayoff - premiumNum;
      if (isSeller) totalNetPnL += premiumNum - cappedPayoff;
    });

    return totalNetPnL;
  }

  // ---- 1. Frontend vs contract payoff consistency ----

  describe("Payoff consistency: frontend vs contract", function () {

    const testCases = [
      { name: "Call ITM — moderate move",    type: CALL, strike: 2000_00000000n, market: 3000_00000000n,    collateral: "1" },
      { name: "Call ITM — small move",       type: CALL, strike: 2000_00000000n, market: 2100_00000000n,    collateral: "1" },
      { name: "Call ITM — large move",       type: CALL, strike: 2000_00000000n, market: 10000_00000000n,   collateral: "1" },
      { name: "Call OTM",                    type: CALL, strike: 2000_00000000n, market: 1500_00000000n,    collateral: "1" },
      { name: "Call ATM",                    type: CALL, strike: 2000_00000000n, market: 2000_00000000n,    collateral: "1" },
      { name: "Put ITM — moderate move",     type: PUT,  strike: 2000_00000000n, market: 1000_00000000n,    collateral: "1" },
      { name: "Put ITM — small move",        type: PUT,  strike: 2000_00000000n, market: 1900_00000000n,    collateral: "1" },
      { name: "Put OTM",                     type: PUT,  strike: 2000_00000000n, market: 2500_00000000n,    collateral: "1" },
      { name: "Put ATM",                     type: PUT,  strike: 2000_00000000n, market: 2000_00000000n,    collateral: "1" },
      { name: "Call ITM — small collateral", type: CALL, strike: 2000_00000000n, market: 5000_00000000n,    collateral: "0.1" },
      { name: "Put ITM — small collateral",  type: PUT,  strike: 2000_00000000n, market: 500_00000000n,     collateral: "0.1" },
    ];

    testCases.forEach(({ name, type, strike, market, collateral }) => {
      it(`${name}`, async function () {
        const collateralWei = ethers.parseEther(collateral);
        const fePayoff = frontendEstimatePayoff(type, strike, collateralWei, market);
        const scPayoffWei = contractPayoff(type, strike, collateralWei, market);
        const scPayoffETH = Number(ethers.formatEther(scPayoffWei));

        expect(Math.abs(fePayoff - scPayoffETH)).to.be.lessThan(1e-12);
      });
    });

    it("should match actual on-chain settlement amounts", async function () {
      const strike = 2000_00000000n;
      const marketAtSettle = 3000_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await mockPriceFeed.updatePrice(marketAtSettle);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      const actualBuyerPayoff = buyerAfter - buyerBefore;
      const actualSellerReturn = sellerAfter - sellerBefore;

      const fePayoff = frontendEstimatePayoff(CALL, strike, ONE_ETH, marketAtSettle);
      const fePayoffWei = ethers.parseEther(fePayoff.toFixed(18));

      expect(actualBuyerPayoff).to.be.closeTo(fePayoffWei, 100n);
      expect(actualBuyerPayoff + actualSellerReturn).to.equal(ONE_ETH);
    });
  });

  // ---- 2. Portfolio Net P&L ----

  describe("Portfolio Net P&L", function () {

    it("buyer P&L = payoff - premium (ITM call)", async function () {
      const strike = 2000_00000000n;
      const market = 3000_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });

      const optData = await optionsContract.getOption(0);
      const pnl = calculateNetPnL([{ id: 0, data: optData }], buyer.address, market);

      const expectedPayoff = frontendEstimatePayoff(CALL, strike, ONE_ETH, market);
      expect(pnl).to.be.closeTo(expectedPayoff - Number(ethers.formatEther(PREMIUM)), 1e-12);
    });

    it("writer P&L = premium - loss (ITM call)", async function () {
      const strike = 2000_00000000n;
      const market = 3000_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });

      const optData = await optionsContract.getOption(0);
      const pnl = calculateNetPnL([{ id: 0, data: optData }], seller.address, market);

      const payoff = frontendEstimatePayoff(CALL, strike, ONE_ETH, market);
      expect(pnl).to.be.closeTo(Number(ethers.formatEther(PREMIUM)) - payoff, 1e-12);
    });

    it("buyer + writer P&L sum to zero (zero-sum)", async function () {
      const strike = 2000_00000000n;
      const market = 3000_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });

      const optData = await optionsContract.getOption(0);
      const opts = [{ id: 0, data: optData }];

      const buyerPnL = calculateNetPnL(opts, buyer.address, market);
      const sellerPnL = calculateNetPnL(opts, seller.address, market);

      expect(Math.abs(buyerPnL + sellerPnL)).to.be.lessThan(1e-12);
    });

    it("same user as buyer and writer across different options", async function () {
      const strike = 2000_00000000n;
      const market = 3000_00000000n;
      const premium1 = ethers.parseEther("0.05");
      const premium2 = ethers.parseEther("0.03");

      await optionsContract.connect(seller).createOption(CALL, strike, premium1, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: premium1 });

      await optionsContract.connect(buyer).createOption(PUT, strike, premium2, expiry, { value: ONE_ETH });
      await optionsContract.connect(seller).buyOption(1, { value: premium2 });

      const opt0 = await optionsContract.getOption(0);
      const opt1 = await optionsContract.getOption(1);
      const opts = [{ id: 0, data: opt0 }, { id: 1, data: opt1 }];

      const buyerPnL = calculateNetPnL(opts, buyer.address, market);

      const payoff0 = frontendEstimatePayoff(CALL, strike, ONE_ETH, market);
      const net0 = payoff0 - Number(ethers.formatEther(premium1));

      const payoff1 = frontendEstimatePayoff(PUT, strike, ONE_ETH, market);
      const net1 = Number(ethers.formatEther(premium2)) - payoff1;

      expect(buyerPnL).to.be.closeTo(net0 + net1, 1e-12);
    });

    it("OTM — writer keeps premium, buyer loses premium", async function () {
      const strike = 2000_00000000n;
      const market = 1500_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });

      const optData = await optionsContract.getOption(0);
      const opts = [{ id: 0, data: optData }];
      const premiumNum = Number(ethers.formatEther(PREMIUM));

      expect(calculateNetPnL(opts, buyer.address, market)).to.be.closeTo(-premiumNum, 1e-12);
      expect(calculateNetPnL(opts, seller.address, market)).to.be.closeTo(premiumNum, 1e-12);
    });
  });

  // ---- 3. End-to-end lifecycle ----

  describe("End-to-end lifecycle", function () {

    it("Call ITM: create → buy → settle", async function () {
      const strike = 2000_00000000n;
      const marketAtSettle = 3000_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });

      const sellerBeforeBuy = await ethers.provider.getBalance(seller.address);
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      const sellerAfterBuy = await ethers.provider.getBalance(seller.address);
      expect(sellerAfterBuy - sellerBeforeBuy).to.equal(PREMIUM);

      const contractBal = await ethers.provider.getBalance(await optionsContract.getAddress());
      expect(contractBal).to.equal(ONE_ETH);

      await mockPriceFeed.updatePrice(marketAtSettle);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      const contractBalAfter = await ethers.provider.getBalance(await optionsContract.getAddress());
      expect(contractBalAfter).to.equal(0n);

      const opt = await optionsContract.getOption(0);
      expect(opt.state).to.equal(2);

      const actualPayoff = buyerAfter - buyerBefore;
      const actualReturn = sellerAfter - sellerBefore;
      expect(actualPayoff + actualReturn).to.equal(ONE_ETH);
      expect(actualPayoff).to.equal(contractPayoff(CALL, strike, ONE_ETH, marketAtSettle));
    });

    it("Put ITM: create → buy → settle", async function () {
      const strike = 2000_00000000n;
      const marketAtSettle = 1000_00000000n;

      await optionsContract.connect(seller).createOption(PUT, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await mockPriceFeed.updatePrice(marketAtSettle);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      const expectedPayoff = contractPayoff(PUT, strike, ONE_ETH, marketAtSettle);
      expect(buyerAfter - buyerBefore).to.equal(expectedPayoff);
      expect(sellerAfter - sellerBefore).to.equal(ONE_ETH - expectedPayoff);
    });

    it("no buyer → expire → seller reclaims collateral", async function () {
      await optionsContract.connect(seller).createOption(CALL, 2000_00000000n, PREMIUM, expiry, { value: ONE_ETH });
      await time.increaseTo(expiry);

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const tx = await optionsContract.connect(seller).expireOption(0);
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(sellerAfter - sellerBefore + gas).to.equal(ONE_ETH);
      expect((await optionsContract.getOption(0)).state).to.equal(3);
    });
  });

  // ---- 4. Multiple concurrent options ----

  describe("Multiple concurrent options", function () {

    it("settling one does not affect another", async function () {
      const strike = 2000_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(seller).createOption(PUT, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await optionsContract.connect(buyer).buyOption(1, { value: PREMIUM });

      await mockPriceFeed.updatePrice(3000_00000000n);
      await time.increaseTo(expiry);
      await optionsContract.connect(other).settleOption(0);

      expect((await optionsContract.getOption(0)).state).to.equal(2);
      expect((await optionsContract.getOption(1)).state).to.equal(1);

      await optionsContract.connect(other).settleOption(1);
      expect((await optionsContract.getOption(1)).state).to.equal(2);
    });

    it("mixed states: expired + settled + still open", async function () {
      const strike = 2000_00000000n;
      const laterExpiry = expiry + ONE_DAY;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(seller).createOption(PUT, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(1, { value: PREMIUM });
      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, laterExpiry, { value: ONE_ETH });

      await mockPriceFeed.updatePrice(1500_00000000n);
      await time.increaseTo(expiry);

      await optionsContract.connect(seller).expireOption(0);
      await optionsContract.connect(other).settleOption(1);

      expect((await optionsContract.getOption(0)).state).to.equal(3);
      expect((await optionsContract.getOption(1)).state).to.equal(2);
      expect((await optionsContract.getOption(2)).state).to.equal(0);

      await optionsContract.connect(buyer).buyOption(2, { value: PREMIUM });
      expect((await optionsContract.getOption(2)).state).to.equal(1);
    });

    it("contract balance = sum of all collaterals", async function () {
      const strike = 2000_00000000n;
      const col1 = ethers.parseEther("1");
      const col2 = ethers.parseEther("2");
      const col3 = ethers.parseEther("0.5");

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: col1 });
      await optionsContract.connect(seller).createOption(PUT, strike, PREMIUM, expiry, { value: col2 });
      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: col3 });

      const balance = await ethers.provider.getBalance(await optionsContract.getAddress());
      expect(balance).to.equal(col1 + col2 + col3);

      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      const balAfterBuy = await ethers.provider.getBalance(await optionsContract.getAddress());
      expect(balAfterBuy).to.equal(col1 + col2 + col3);
    });
  });

  // ---- 5. Extreme price scenarios ----

  describe("Extreme price scenarios", function () {

    it("$1M ETH — Call payoff approaches full collateral", async function () {
      const strike = 2000_00000000n;
      const extremePrice = 1_000_000_00000000n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await mockPriceFeed.updatePrice(extremePrice);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);

      expect(buyerAfter - buyerBefore).to.equal(contractPayoff(CALL, strike, ONE_ETH, extremePrice));
      expect(buyerAfter - buyerBefore).to.be.greaterThan(ethers.parseEther("0.99"));
    });

    it("$1 ETH — Put payoff capped at collateral", async function () {
      const strike = 2000_00000000n;
      const extremePrice = 1_00000000n;

      await optionsContract.connect(seller).createOption(PUT, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await mockPriceFeed.updatePrice(extremePrice);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);

      expect(buyerAfter - buyerBefore).to.equal(ONE_ETH);
    });

    it("barely ITM — minimal but nonzero payoff", async function () {
      const strike = 2000_00000000n;
      const barelyITM = strike + 1n;

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await mockPriceFeed.updatePrice(barelyITM);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);

      expect(buyerAfter - buyerBefore).to.be.greaterThan(0n);
    });

    it("tiny collateral — payoff capped correctly", async function () {
      const strike = 2000_00000000n;
      const market = 4000_00000000n;
      const tinyCollateral = ethers.parseEther("0.001");

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: tinyCollateral });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await mockPriceFeed.updatePrice(market);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);

      expect(buyerAfter - buyerBefore).to.equal(tinyCollateral);
    });

    it("huge collateral — payoff not inflated beyond formula", async function () {
      const strike = 2000_00000000n;
      const market = 3000_00000000n;
      const hugeCollateral = ethers.parseEther("100");

      await optionsContract.connect(seller).createOption(CALL, strike, PREMIUM, expiry, { value: hugeCollateral });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await mockPriceFeed.updatePrice(market);
      await time.increaseTo(expiry);

      const buyerBefore = await ethers.provider.getBalance(buyer.address);
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await optionsContract.connect(other).settleOption(0);
      const buyerAfter = await ethers.provider.getBalance(buyer.address);
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(buyerAfter - buyerBefore).to.equal(contractPayoff(CALL, strike, hugeCollateral, market));
      expect(sellerAfter - sellerBefore).to.equal(hugeCollateral - (buyerAfter - buyerBefore));
      expect(buyerAfter - buyerBefore).to.be.lessThan(hugeCollateral);
    });
  });

  // ---- 6. Anyone-can-settle ----

  describe("Anyone-can-settle", function () {

    beforeEach(async function () {
      await optionsContract.connect(seller).createOption(CALL, 2000_00000000n, PREMIUM, expiry, { value: ONE_ETH });
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await time.increaseTo(expiry);
    });

    it("third party can settle", async function () {
      await expect(optionsContract.connect(other).settleOption(0)).to.not.be.reverted;
    });

    it("buyer can settle", async function () {
      await expect(optionsContract.connect(buyer).settleOption(0)).to.not.be.reverted;
    });

    it("seller can settle", async function () {
      await expect(optionsContract.connect(seller).settleOption(0)).to.not.be.reverted;
    });
  });
});
