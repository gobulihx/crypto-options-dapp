const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("CryptoOptions", function () {

  // ============ Constants ============

  // Chainlink ETH/USD uses 8 decimals
  const ETH_PRICE_2000 = 2000_00000000n;  // $2000
  const ETH_PRICE_3000 = 3000_00000000n;  // $3000
  const ETH_PRICE_1000 = 1000_00000000n;  // $1000
  const ETH_PRICE_2500 = 2500_00000000n;  // $2500

  const CALL = 0;
  const PUT = 1;

  const STATE_OPEN = 0;
  const STATE_PURCHASED = 1;
  const STATE_SETTLED = 2;
  const STATE_EXPIRED = 3;

  const ONE_DAY = 86400;
  const ONE_ETH = ethers.parseEther("1");
  const PREMIUM = ethers.parseEther("0.05");

  // ============ Setup ============

  let optionsContract, mockPriceFeed;
  let seller, buyer, other;
  let expiry;

  beforeEach(async function () {
    [seller, buyer, other] = await ethers.getSigners();

    // Deploy mock price feed at $2000
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
    mockPriceFeed = await MockV3Aggregator.deploy(8, ETH_PRICE_2000);

    // Deploy options contract
    const CryptoOptions = await ethers.getContractFactory("CryptoOptions");
    optionsContract = await CryptoOptions.deploy(await mockPriceFeed.getAddress());

    // Default expiry: 1 day from now
    const latest = await time.latest();
    expiry = latest + ONE_DAY;
  });

  // Helper: seller creates a call option with 1 ETH collateral
  async function createDefaultCall() {
    return optionsContract.connect(seller).createOption(
      CALL,
      ETH_PRICE_2000,
      PREMIUM,
      expiry,
      { value: ONE_ETH }
    );
  }

  // Helper: seller creates a put option with 1 ETH collateral
  async function createDefaultPut() {
    return optionsContract.connect(seller).createOption(
      PUT,
      ETH_PRICE_2000,
      PREMIUM,
      expiry,
      { value: ONE_ETH }
    );
  }

  // ============ createOption ============

  describe("createOption", function () {

    it("should create a call option with correct parameters", async function () {
      await createDefaultCall();
      const opt = await optionsContract.getOption(0);

      expect(opt.seller).to.equal(seller.address);
      expect(opt.buyer).to.equal(ethers.ZeroAddress);
      expect(opt.optionType).to.equal(CALL);
      expect(opt.strikePrice).to.equal(ETH_PRICE_2000);
      expect(opt.premium).to.equal(PREMIUM);
      expect(opt.collateral).to.equal(ONE_ETH);
      expect(opt.state).to.equal(STATE_OPEN);
    });

    it("should create a put option", async function () {
      await createDefaultPut();
      const opt = await optionsContract.getOption(0);
      expect(opt.optionType).to.equal(PUT);
    });

    it("should increment option IDs", async function () {
      await createDefaultCall();
      await createDefaultCall();
      const opt0 = await optionsContract.getOption(0);
      const opt1 = await optionsContract.getOption(1);
      expect(opt0.seller).to.equal(seller.address);
      expect(opt1.seller).to.equal(seller.address);
    });

    it("should emit OptionCreated event", async function () {
      await expect(createDefaultCall())
        .to.emit(optionsContract, "OptionCreated")
        .withArgs(0, seller.address, CALL, ETH_PRICE_2000, PREMIUM, ONE_ETH, expiry);
    });

    it("should lock collateral in contract", async function () {
      await createDefaultCall();
      const balance = await ethers.provider.getBalance(await optionsContract.getAddress());
      expect(balance).to.equal(ONE_ETH);
    });

    it("should revert if collateral is 0", async function () {
      await expect(
        optionsContract.connect(seller).createOption(CALL, ETH_PRICE_2000, PREMIUM, expiry, { value: 0 })
      ).to.be.revertedWith("Collateral must be greater than 0");
    });

    it("should revert if strike price is 0", async function () {
      await expect(
        optionsContract.connect(seller).createOption(CALL, 0, PREMIUM, expiry, { value: ONE_ETH })
      ).to.be.revertedWith("Strike price must be greater than 0");
    });

    it("should revert if premium is 0", async function () {
      await expect(
        optionsContract.connect(seller).createOption(CALL, ETH_PRICE_2000, 0, expiry, { value: ONE_ETH })
      ).to.be.revertedWith("Premium must be greater than 0");
    });

    it("should revert if expiry is in the past", async function () {
      const pastExpiry = (await time.latest()) - 100;
      await expect(
        optionsContract.connect(seller).createOption(CALL, ETH_PRICE_2000, PREMIUM, pastExpiry, { value: ONE_ETH })
      ).to.be.revertedWith("Expiry must be in the future");
    });
  });

  // ============ buyOption ============

  describe("buyOption", function () {

    beforeEach(async function () {
      await createDefaultCall();
    });

    it("should allow buyer to purchase an option", async function () {
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      const opt = await optionsContract.getOption(0);
      expect(opt.buyer).to.equal(buyer.address);
      expect(opt.state).to.equal(STATE_PURCHASED);
    });

    it("should transfer premium to seller", async function () {
      const sellerBefore = await ethers.provider.getBalance(seller.address);
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      const sellerAfter = await ethers.provider.getBalance(seller.address);
      expect(sellerAfter - sellerBefore).to.equal(PREMIUM);
    });

    it("should emit OptionPurchased event", async function () {
      await expect(optionsContract.connect(buyer).buyOption(0, { value: PREMIUM }))
        .to.emit(optionsContract, "OptionPurchased")
        .withArgs(0, buyer.address);
    });

    it("should revert if option is not open", async function () {
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await expect(
        optionsContract.connect(other).buyOption(0, { value: PREMIUM })
      ).to.be.revertedWith("Option is not available");
    });

    it("should revert if option has expired", async function () {
      await time.increaseTo(expiry + 1);
      await expect(
        optionsContract.connect(buyer).buyOption(0, { value: PREMIUM })
      ).to.be.revertedWith("Option has expired");
    });

    it("should revert if seller tries to buy own option", async function () {
      await expect(
        optionsContract.connect(seller).buyOption(0, { value: PREMIUM })
      ).to.be.revertedWith("Seller cannot buy own option");
    });

    it("should revert if wrong premium amount", async function () {
      await expect(
        optionsContract.connect(buyer).buyOption(0, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWith("Must pay exact premium");
    });
  });

  // ============ settleOption ============

  describe("settleOption", function () {

    // ---- Call Option Settlement ----

    describe("Call option", function () {

      beforeEach(async function () {
        await createDefaultCall(); // strike = $2000, collateral = 1 ETH
        await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      });

      it("should settle ITM call — buyer gets payoff, seller gets remainder", async function () {
        // Market price rises to $3000 (ITM)
        await mockPriceFeed.updatePrice(ETH_PRICE_3000);
        await time.increaseTo(expiry);

        const buyerBefore = await ethers.provider.getBalance(buyer.address);
        const sellerBefore = await ethers.provider.getBalance(seller.address);

        await optionsContract.connect(other).settleOption(0);

        const buyerAfter = await ethers.provider.getBalance(buyer.address);
        const sellerAfter = await ethers.provider.getBalance(seller.address);

        // Expected payoff: (3000 - 2000) / 3000 * 1e18 = 0.3333... ETH
        const expectedPayoff = (ETH_PRICE_3000 - ETH_PRICE_2000) * BigInt(1e18) / ETH_PRICE_3000;
        const expectedReturn = ONE_ETH - expectedPayoff;

        expect(buyerAfter - buyerBefore).to.equal(expectedPayoff);
        expect(sellerAfter - sellerBefore).to.equal(expectedReturn);
      });

      it("should settle OTM call — seller gets all collateral back", async function () {
        // Market price drops to $1000 (OTM)
        await mockPriceFeed.updatePrice(ETH_PRICE_1000);
        await time.increaseTo(expiry);

        const sellerBefore = await ethers.provider.getBalance(seller.address);
        await optionsContract.connect(other).settleOption(0);
        const sellerAfter = await ethers.provider.getBalance(seller.address);

        expect(sellerAfter - sellerBefore).to.equal(ONE_ETH);

        const opt = await optionsContract.getOption(0);
        expect(opt.state).to.equal(STATE_SETTLED);
      });

      it("should settle ATM call — seller gets all collateral back", async function () {
        // Market price stays at $2000 (ATM)
        await time.increaseTo(expiry);

        const sellerBefore = await ethers.provider.getBalance(seller.address);
        await optionsContract.connect(other).settleOption(0);
        const sellerAfter = await ethers.provider.getBalance(seller.address);

        expect(sellerAfter - sellerBefore).to.equal(ONE_ETH);
      });
    });

    // ---- Put Option Settlement ----

    describe("Put option", function () {

      beforeEach(async function () {
        await createDefaultPut(); // strike = $2000, collateral = 1 ETH
        await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      });

      it("should settle ITM put — buyer gets payoff", async function () {
        // Market price drops to $1000 (ITM for put)
        await mockPriceFeed.updatePrice(ETH_PRICE_1000);
        await time.increaseTo(expiry);

        const buyerBefore = await ethers.provider.getBalance(buyer.address);
        await optionsContract.connect(other).settleOption(0);
        const buyerAfter = await ethers.provider.getBalance(buyer.address);

        // Expected payoff: (2000 - 1000) / 1000 * 1e18 = 1 ETH
        // But capped at collateral = 1 ETH
        const expectedPayoff = (ETH_PRICE_2000 - ETH_PRICE_1000) * BigInt(1e18) / ETH_PRICE_1000;
        const cappedPayoff = expectedPayoff > ONE_ETH ? ONE_ETH : expectedPayoff;

        expect(buyerAfter - buyerBefore).to.equal(cappedPayoff);
      });

      it("should settle OTM put — seller gets all collateral back", async function () {
        // Market price rises to $3000 (OTM for put)
        await mockPriceFeed.updatePrice(ETH_PRICE_3000);
        await time.increaseTo(expiry);

        const sellerBefore = await ethers.provider.getBalance(seller.address);
        await optionsContract.connect(other).settleOption(0);
        const sellerAfter = await ethers.provider.getBalance(seller.address);

        expect(sellerAfter - sellerBefore).to.equal(ONE_ETH);
      });
    });

    // ---- Payoff cap ----

    describe("Payoff capping", function () {

      it("should cap payoff at collateral when payoff exceeds collateral", async function () {
        // Create call with small collateral
        const smallCollateral = ethers.parseEther("0.1");
        await optionsContract.connect(seller).createOption(
          CALL, ETH_PRICE_2000, PREMIUM, expiry, { value: smallCollateral }
        );
        await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });

        // Price doubles — payoff would be 0.5 ETH but collateral is only 0.1
        await mockPriceFeed.updatePrice(ETH_PRICE_3000);
        await time.increaseTo(expiry);

        const buyerBefore = await ethers.provider.getBalance(buyer.address);
        await optionsContract.connect(other).settleOption(0);
        const buyerAfter = await ethers.provider.getBalance(buyer.address);

        // Payoff capped at collateral
        expect(buyerAfter - buyerBefore).to.equal(smallCollateral);
      });
    });

    // ---- Edge cases ----

    describe("Edge cases", function () {

      it("should revert if option not purchased", async function () {
        await createDefaultCall();
        await time.increaseTo(expiry);
        await expect(
          optionsContract.connect(other).settleOption(0)
        ).to.be.revertedWith("Option not purchased");
      });

      it("should revert if option not yet expired", async function () {
        await createDefaultCall();
        await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
        await expect(
          optionsContract.connect(other).settleOption(0)
        ).to.be.revertedWith("Option has not expired yet");
      });

      it("should revert if option already settled", async function () {
        await createDefaultCall();
        await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
        await time.increaseTo(expiry);
        await optionsContract.connect(other).settleOption(0);
        await expect(
          optionsContract.connect(other).settleOption(0)
        ).to.be.revertedWith("Option not purchased");
      });

      it("should allow anyone to trigger settlement", async function () {
        await createDefaultCall();
        await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
        await time.increaseTo(expiry);
        // 'other' (not buyer or seller) triggers settlement
        await expect(optionsContract.connect(other).settleOption(0)).to.not.be.reverted;
      });
    });
  });

  // ============ expireOption ============

  describe("expireOption", function () {

    it("should allow seller to reclaim collateral after expiry", async function () {
      await createDefaultCall();
      await time.increaseTo(expiry);

      const sellerBefore = await ethers.provider.getBalance(seller.address);
      const tx = await optionsContract.connect(seller).expireOption(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const sellerAfter = await ethers.provider.getBalance(seller.address);

      expect(sellerAfter - sellerBefore + gasCost).to.equal(ONE_ETH);

      const opt = await optionsContract.getOption(0);
      expect(opt.state).to.equal(STATE_EXPIRED);
    });

    it("should emit OptionExpired event", async function () {
      await createDefaultCall();
      await time.increaseTo(expiry);
      await expect(optionsContract.connect(seller).expireOption(0))
        .to.emit(optionsContract, "OptionExpired")
        .withArgs(0);
    });

    it("should revert if option was purchased", async function () {
      await createDefaultCall();
      await optionsContract.connect(buyer).buyOption(0, { value: PREMIUM });
      await time.increaseTo(expiry);
      await expect(
        optionsContract.connect(seller).expireOption(0)
      ).to.be.revertedWith("Option is not open");
    });

    it("should revert if not yet expired", async function () {
      await createDefaultCall();
      await expect(
        optionsContract.connect(seller).expireOption(0)
      ).to.be.revertedWith("Option has not expired yet");
    });

    it("should revert if caller is not seller", async function () {
      await createDefaultCall();
      await time.increaseTo(expiry);
      await expect(
        optionsContract.connect(other).expireOption(0)
      ).to.be.revertedWith("Only seller can expire");
    });
  });

  // ============ getLatestPrice ============

  describe("getLatestPrice", function () {

    it("should return correct price from oracle", async function () {
      const price = await optionsContract.getLatestPrice();
      expect(price).to.equal(ETH_PRICE_2000);
    });

    it("should reflect updated price", async function () {
      await mockPriceFeed.updatePrice(ETH_PRICE_3000);
      const price = await optionsContract.getLatestPrice();
      expect(price).to.equal(ETH_PRICE_3000);
    });
  });
});
