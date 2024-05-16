const { ethers } = require('ethers');
const { formatUnits } = require('ethers/lib/utils');
const CamelotNitroPool = require('./abis/CamelotNitroPool.json');
const CamelotPool = require('./abis/CamelotPool.json');
const ERC20 = require('./abis/ERC20.json');
const SpNFT = require('./abis/SpNFT.json');
const LpToken = require('./abis/LpToken.json');

const getContract = (address, abi) => {
  const jsonRpcProvider = new ethers.getDefaultProvider('https://arb1.arbitrum.io/rpc')
  return new ethers.Contract(address, abi, jsonRpcProvider)
}

const fromBigNumber = (number, decimals = 18) => {
  return parseFloat(formatUnits(number.toString(), decimals))
}

const fetchSpNFTBalances = async (spNFTAddress, userAddress, collateral0, collateral1) => {
  const spNFTContract = getContract(spNFTAddress, SpNFT.abi);
  const spNFTCount = await spNFTContract.balanceOf(userAddress);
  let totalODBalance = 0;
  let totalWETHBalance = 0;

  for (let i = 0; i < spNFTCount; i++) {
    const tokenId = await spNFTContract.tokenOfOwnerByIndex(userAddress, i);
    const stakingPosition = await spNFTContract.getStakingPosition(tokenId);
    const poolInfo = await spNFTContract.getPoolInfo();
    const lpToken = getContract(poolInfo.lpToken, LpToken.abi);
    const lpToken0 = await lpToken.token0();
    const lpToken1 = await lpToken.token1();

    if (lpToken0.toLowerCase() === collateral0.toLowerCase() && lpToken1.toLowerCase() === collateral1.toLowerCase()) {
      totalODBalance += fromBigNumber(stakingPosition.amount);
    } else if (lpToken0.toLowerCase() === collateral1.toLowerCase() && lpToken1.toLowerCase() === collateral0.toLowerCase()) {
      totalWETHBalance += fromBigNumber(stakingPosition.amount);
    }
  }

  return { totalODBalance, totalWETHBalance };
}

const fetchUserPoolDetails = async (poolAddress, nitroPoolAddress, userAddress) => {
  // Fetch both pools
  const camelotNitroPool = getContract(nitroPoolAddress, CamelotNitroPool.abi)
  const camelotPool = getContract(poolAddress, CamelotPool.abi)

  // Fetch collateral tokens for pools
  const collateral0 = await camelotPool.token0()  // OD
  const collateral1 = await camelotPool.token1()  // WETH
  const collateral0Contract = getContract(collateral0, ERC20.abi)
  const collateral1Contract = getContract(collateral1, ERC20.abi)

  // Fetch TVL from Camelot's API
  const response = await fetch('https://api.camelot.exchange/nitros')
  const res = await response.json()
  const tvlUSD = parseFloat(res.data.nitros[nitroPoolAddress]?.tvlUSD || 0)

  // Fetch the user's balance in both tokens including spNFT balances
  const spNFTAddresses = [
    '0x7647da336cf43f894ac7a0bf87f04806b2e03bb8',  // OD-ETH spNFT
  ]

  let totalODBalance = 0;
  let totalWETHBalance = 0;

  for (const spNFTAddress of spNFTAddresses) {
    const { totalODBalance: odBalance, totalWETHBalance: wethBalance } = await fetchSpNFTBalances(spNFTAddress, userAddress, collateral0, collateral1);
    totalODBalance += odBalance;
    totalWETHBalance += wethBalance;
  }

  const collateralTokens = [
    {
      symbol: await collateral0Contract.symbol(),
      userBalance: fromBigNumber(await collateral0Contract.balanceOf(userAddress)),
      nitroPoolBalance: fromBigNumber(await collateral0Contract.balanceOf(nitroPoolAddress)),
      poolBalance: fromBigNumber(await collateral0Contract.balanceOf(poolAddress)),
      spNFTBalance: totalODBalance,
      address: collateral0,
    },
    {
      symbol: await collateral1Contract.symbol(),
      userBalance: fromBigNumber(await collateral1Contract.balanceOf(userAddress)),
      nitroPoolBalance: fromBigNumber(await collateral1Contract.balanceOf(nitroPoolAddress)),
      poolBalance: fromBigNumber(await collateral1Contract.balanceOf(poolAddress)),
      spNFTBalance: totalWETHBalance,
      address: collateral1,
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
  const userDollarValue = userPoolPercentage * tvlUSD;

  console.log('Collateral Tokens:', collateralTokens);
  console.log('User Info:', userInfo);
  console.log('User Deposit Amount:', userDepositAmount);
  console.log('Total Deposit Amount:', totalDepositAmount);
  console.log('User Pool Percentage:', (userPoolPercentage * 100).toFixed(2) + '%');
  console.log('User Dollar Value:', '$' + userDollarValue.toFixed(2));
  console.log('TVL USD:', '$' + tvlUSD.toFixed(2));
  console.log('User Collateral Balances:', userCollateralBalances);

  return {
    collateralTokens,
    userInfo,
    userDepositAmount,
    totalDepositAmount,
    userPoolPercentage: userPoolPercentage * 100,
    userDollarValue,
    userCollateralBalances
  }
}

fetchUserPoolDetails('0x824959a55907d5350e73e151Ff48DabC5A37a657', '0x53F973256F410d1D8b10ce72D03D8dBBD3b1066E', '0x9e07ecD4f5074a2EEAC9C42dF6508e3ec6373EF3')
