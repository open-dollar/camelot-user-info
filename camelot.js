const { ethers } = require('ethers');
const { formatUnits } = require('ethers/lib/utils');
const CamelotNitroPool = require('./abis/CamelotNitroPool.json');
const CamelotPool = require('./abis/CamelotPool.json');
const AlgebraPositions = require('./abis/AlgebraPositions.json');
const ERC20 = require('./abis/ERC20.json');
const SpNFT = require('./abis/SpNFT.json');
const LpToken = require('./abis/LpToken.json');

const getContract = (address, abi) => {
  const jsonRpcProvider = new ethers.getDefaultProvider(process.env.NETWORK_URL || 'https://arb1.arbitrum.io/rpc')
  return new ethers.Contract(address, abi, jsonRpcProvider)
}

const fromBigNumber = (number, decimals = 18) => {
  return parseFloat(formatUnits(number.toString(), decimals))
}

const lpBalanceFromSpNFTs = async (userAddress, spNFTAddress, collateral0Address, collateral1Address) => {
  const spNFTContract = getContract(spNFTAddress, SpNFT.abi);

  // Validate LP collateral tokens match expected values
  const poolInfo = await spNFTContract.getPoolInfo();
  const lpToken = getContract(poolInfo.lpToken, LpToken.abi);
  const lpCollateral0Address = await lpToken.token0();
  const lpCollateral1Address = await lpToken.token1();
  if (lpCollateral0Address.toLowerCase() !== collateral0Address.toLowerCase() || lpCollateral1Address.toLowerCase() !== collateral1Address.toLowerCase()) {
    throw 'fetchSpNFTBalances - Invalid LP Token'
  }

  // Get LP Balance for all spNFTs owned by user
  const spNFTCount = await spNFTContract.balanceOf(userAddress);
  let lpBalance = 0
  for (let i = 0; i < spNFTCount; i++) {
    const tokenId = await spNFTContract.tokenOfOwnerByIndex(userAddress, i);

    const positionDetails = await spNFTContract.getStakingPosition(tokenId);
    lpBalance += fromBigNumber(positionDetails.amount);
  }
  console.log('LP Balance from spNFT:', lpBalance)
  return lpBalance
}

const lpBalanceFromAlgebraPositions = async (userAddress, collateral0Address, collateral1Address) => {
  const CAMELOT_V1_NFT_ADDRESS = "0x00c7f3082833e796A5b3e4Bd59f6642FF44DCD15"
  const algebraPositionsContract = getContract(CAMELOT_V1_NFT_ADDRESS, AlgebraPositions.abi)
  const nftCount = await algebraPositionsContract.balanceOf(userAddress);
  let lpBalance = 0;
  for (let i = 0; i < nftCount; i++) {
    const tokenId = await algebraPositionsContract.tokenOfOwnerByIndex(userAddress, i);
    const positions = await algebraPositionsContract.positions(tokenId);
    if (positions.token0.toLowerCase() === collateral0Address.toLowerCase() && positions.token1.toLowerCase() === collateral1Address.toLowerCase()) {
      lpBalance += fromBigNumber(positions.liquidity);
    }
  }
  console.log('LP Balance from Algebra Positions V1:', lpBalance);
  return lpBalance;
}

const fetchUserPoolDetails = async (poolAddress, nitroPoolAddress, userAddress) => {
  // Fetch both pools
  const camelotNitroPool = getContract(nitroPoolAddress, CamelotNitroPool.abi)
  const camelotPool = getContract(poolAddress, CamelotPool.abi)

  // Fetch collateral tokens for pools
  const collateral0Address = await camelotPool.token0()  // OD
  const collateral1Address = await camelotPool.token1()  // WETH
  const collateral0 = getContract(collateral0Address, ERC20.abi)
  const collateral1 = getContract(collateral1Address, ERC20.abi)

  // Fetch TVL from Camelot's API
  const response = await fetch('https://api.camelot.exchange/nitros')
  const res = await response.json()

  // Fetch the user's balance in both tokens including spNFT balances
  const spNFTAddresses = [
    '0x7647Da336cF43F894aC7A0bf87f04806b2E03bb8',  // OD-ETH spNFT
  ]

  let lpBalance = 0;

  lpBalance += await lpBalanceFromAlgebraPositions(userAddress, collateral0Address, collateral1Address);

  for (const spNFTAddress of spNFTAddresses) {
    lpBalance += await lpBalanceFromSpNFTs(userAddress, spNFTAddress, collateral0Address, collateral1Address);
  }

  console.log('Total LP Balance:', lpBalance);
  return
  const collateralTokens = [
    {
      symbol: await collateral0.symbol(),
      address: collateral0Address,
      spNFTBalance: totalCollateral0Balance,
      userBalance: fromBigNumber(await collateral0.balanceOf(userAddress)),
      nitroPoolBalance: fromBigNumber(await collateral0.balanceOf(nitroPoolAddress)),
      poolBalance: fromBigNumber(await collateral0.balanceOf(poolAddress)),
    },
    {
      symbol: await collateral1.symbol(),
      address: collateral1Address,
      spNFTBalance: totalCollateral1Balance,
      userBalance: fromBigNumber(await collateral1.balanceOf(userAddress)),
      nitroPoolBalance: fromBigNumber(await collateral1.balanceOf(nitroPoolAddress)),
      poolBalance: fromBigNumber(await collateral1.balanceOf(poolAddress)),
    }
  ]

  const userInfo = await camelotNitroPool.userInfo(userAddress);
  const userDepositAmount = fromBigNumber(userInfo.totalDepositAmount);
  const totalDepositAmount = fromBigNumber(await camelotNitroPool.totalDepositAmount());

  // Calculate the user's percentage of the pool
  const userPoolPercentage = userDepositAmount / totalDepositAmount;

  // Calculate the user's share of each collateral token
  const userCollateralBalances = collateralTokens.map(token => {
    const totalBalance = token.nitroPoolBalance + token.poolBalance + token.spNFTBalance;
    const userShare = userPoolPercentage * totalBalance;
    return {
      symbol: token.symbol,
      userShare: userShare
    };
  });

  // Calculate the dollar value of the user's share of the pool
  // const userDollarValue = userPoolPercentage * tvlUSD;

  console.log('Collateral:', collateralTokens);
  // console.log('User Info:', userInfo);
  console.log('User Deposit Amount:', userDepositAmount);
  console.log('Total Deposit Amount:', totalDepositAmount);
  // console.log('User Pool Percentage:', (userPoolPercentage * 100).toFixed(2) + '%');
  // console.log('User Dollar Value:', '$' + userDollarValue.toFixed(2));
  // console.log('TVL USD:', '$' + tvlUSD.toFixed(2));
  console.log('User Collateral Balances:', userCollateralBalances);
}

fetchUserPoolDetails('0x824959a55907d5350e73e151Ff48DabC5A37a657', '0x53F973256F410d1D8b10ce72D03D8dBBD3b1066E', '0x9492510BbCB93B6992d8b7Bb67888558E12DCac4')
