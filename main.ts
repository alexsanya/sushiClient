import { computePoolAddress, FeeAmount, MintOptions, nearestUsableTick, NonfungiblePositionManager } from '@uniswap/v3-sdk'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { Token, BigintIsh, Percent, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES } from '@uniswap/sdk-core'
import { Pool, Position } from '@uniswap/v3-sdk'
import { Contract, ethers, JsonRpcProvider, Wallet } from 'ethers';

const SEPOLIA_ID = 11155111;
const FORK_RPC = "http://127.0.0.1:8545";
const POOL_FACTORY_CONTRACT_ADDRESS: string = "0x1f2FCf1d036b375b384012e61D3AA33F8C256bbE";
const NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS: string = "0x544bA588efD839d2692Fc31EA991cD39993c135F";
const USDC_ADDRESS = "0x1a6922a04b14b1560875d77a8c02ab3c0e354020";
const DAI_ADDRESS = "0x59e3a6011631de8e5302e5138d7eb3006e607b75";

const token0: Token = new Token(SEPOLIA_ID, USDC_ADDRESS, 6);
const token1: Token = new Token(SEPOLIA_ID, DAI_ADDRESS, 18);
const poolFee: FeeAmount = 500;

const USDC_VALUE = 100500;
const DAI_VALUE = 100500000000;
const ACTOR_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const USDC_ABI = [
    "function balanceOf(address) public view returns (uint256)",
    "function transfer(address,uint256) public",
    "function approve(address,uint256) public",
    "function mint(uint256) public"
];

const provider = new JsonRpcProvider(FORK_RPC);
const actor = new Wallet(ACTOR_KEY, provider);

const MAX_FEE_PER_GAS = 250000000000;
const MAX_PRIORITY_FEE_PER_GAS = 250000000000;

(async function main() {
    const currentPoolAddress = computePoolAddress({
        factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
        tokenA: token0,
        tokenB: token1,
        fee: poolFee,
    });
    console.log({ currentPoolAddress });
    const poolContract = new ethers.Contract(
        currentPoolAddress,
        IUniswapV3PoolABI.abi,
        provider
      )
      
    const [liquidity, slot0] =
        await Promise.all([
          poolContract.liquidity(),
          poolContract.slot0(),
        ])

    console.log({ liquidity, slot0 });

    console.log('Tick: ', slot0.tick);
    console.log('SqrtRatio: ', slot0.sqrtPriceX96.toString());

    const configuredPool = new Pool(
        token0,
        token1,
        poolFee,
        slot0.sqrtPriceX96.toString(),
        liquidity.toString(),
        Number(slot0.tick)
    );

    const amount0: BigintIsh = "9990000000000";
    const amount1: BigintIsh = "10500090000000000000000000";

    const position = Position.fromAmounts({
        pool: configuredPool,
        tickLower:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) -
          configuredPool.tickSpacing * 2,
        tickUpper:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) +
          configuredPool.tickSpacing * 2,
        amount0: amount0,
        amount1: amount1,
        useFullPrecision: true,
    })

    const mintOptions: MintOptions = {
        recipient: actor.address,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
    }
    const { calldata, value } = NonfungiblePositionManager.addCallParameters(
        position,
        mintOptions
    )
    console.log({ calldata, value });

    const tokensOwner = "0x55Dc5ce95849273F522Fe914D3fa035d9E380d4A";
      // Impersonate the token holder
  await provider.send('anvil_impersonateAccount', [tokensOwner]);

  // Get the token holder signer
  const signer = await provider.getSigner(tokensOwner);

  // Connect signed with the contract
  const usdcContract = new Contract(USDC_ADDRESS, USDC_ABI, signer);
  const daiContract = new Contract(DAI_ADDRESS, USDC_ABI, signer);
  const usdcBalanceBefore = await usdcContract.balanceOf(actor.address);
  const daiBalanceBefore = await daiContract.balanceOf(actor.address);
  await usdcContract.mint(amount0);
  await usdcContract.transfer(actor.address, amount0);
  await daiContract.mint(amount1);
  await daiContract.transfer(actor.address, amount1);

  const usdcBalanceAfter = await usdcContract.balanceOf(actor.address);
  const daiBalanceAfter = await daiContract.balanceOf(actor.address);
  console.log({ usdcBalanceBefore, usdcBalanceAfter });
  console.log({ daiBalanceBefore, daiBalanceAfter });

//approvals
    await usdcContract.connect(actor).approve(NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, amount0);
    await daiContract.connect(actor).approve(NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, amount1);
  

    const transaction = {
        data: calldata,
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        value: value,
        from: actor.address,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
      }

    const txRes = await actor.sendTransaction(transaction);
    console.log({ txRes });

})()