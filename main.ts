import { computePoolAddress, FeeAmount, MintOptions, nearestUsableTick, NonfungiblePositionManager } from '@uniswap/v3-sdk'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { Token, BigintIsh, Percent } from '@uniswap/sdk-core'
import { Pool, Position } from '@uniswap/v3-sdk'
import { Contract, ethers, JsonRpcProvider, Provider, TransactionRequest, Wallet } from 'ethers';
import { CHAIN_ID, NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, POOL_FACTORY_CONTRACT_ADDRESS, POOL_FEE, TOKEN_A_ADDRESS, TOKEN_A_DECIMALS, TOKEN_A_MINTER_ADDRESS, TOKEN_B_ADDRESS, TOKEN_B_DECIMALS, TOKEN_B_MINTER_ADDRESS } from './chains/sepolia';
import { ERC20_ABI } from './abis/erc20';
import JSBI from 'jsbi';


const tokenA: Token = new Token(CHAIN_ID, TOKEN_A_ADDRESS, TOKEN_A_DECIMALS);
const tokenB: Token = new Token(CHAIN_ID, TOKEN_B_ADDRESS, TOKEN_B_DECIMALS);
const poolFee: FeeAmount = POOL_FEE;

const USER_PRIVATE_KEY: string = process.env['USER_PRIVATE_KEY'] as string;

const MAX_FEE_PER_GAS = 250000000000;
const MAX_PRIORITY_FEE_PER_GAS = 250000000000;

interface PositionInfo {
    tickLower: number
    tickUpper: number
    liquidity: JSBI
    feeGrowthInside0LastX128: JSBI
    feeGrowthInside1LastX128: JSBI
    tokensOwed0: JSBI
    tokensOwed1: JSBI
}

function getPoolContract(provider: Provider): Contract {
    const currentPoolAddress = computePoolAddress({
        factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
        tokenA,
        tokenB,
        fee: poolFee,
    });
    return new ethers.Contract(
        currentPoolAddress,
        IUniswapV3PoolABI.abi,
        provider
    );
}

async function getConfiguredPool(poolContract: Contract): Promise<Pool> {
    const [liquidity, slot0] =
        await Promise.all([
          poolContract.liquidity(),
          poolContract.slot0(),
        ]);

    console.debug({ liquidity, slot0 });

    return new Pool(
        tokenA,
        tokenB,
        poolFee,
        slot0.sqrtPriceX96.toString(),
        liquidity.toString(),
        Number(slot0.tick)
    );
}

function getPosition(configuredPool: Pool, amountA: BigintIsh, amountB: BigintIsh): Position {
    return Position.fromAmounts({
        pool: configuredPool,
        tickLower:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) -
          configuredPool.tickSpacing * 2,
        tickUpper:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) +
          configuredPool.tickSpacing * 2,
        amount0: amountA,
        amount1: amountB,
        useFullPrecision: true,
    })
}

function getMintOptions(recipient: string): MintOptions {
    return {
        recipient,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
    }
}

async function supplyAndApproveTokens(provider: JsonRpcProvider, user: Wallet, amountA: BigintIsh, amountB: BigintIsh): Promise<void> {

    // Impersonate the token holder
    await provider.send('anvil_impersonateAccount', [TOKEN_A_MINTER_ADDRESS]);
    if (TOKEN_A_ADDRESS !== TOKEN_B_ADDRESS) {
        await provider.send('anvil_impersonateAccount', [TOKEN_B_MINTER_ADDRESS]);
    }

    // Get the token holder signer
    const minterA = await provider.getSigner(TOKEN_A_MINTER_ADDRESS);
    const minterB = await provider.getSigner(TOKEN_B_MINTER_ADDRESS);

    // Connect signed with the contract
    const erc20Acontract = new Contract(TOKEN_A_ADDRESS, ERC20_ABI, minterA);
    const erc20Bcontract = new Contract(TOKEN_B_ADDRESS, ERC20_ABI, minterB);
    const [balanceAbefore, balanceBbefore] = await Promise.all([
        erc20Acontract.balanceOf(user.address),
        erc20Bcontract.balanceOf(user.address)
    ]);
    // mint and transfer
    const [mintAtx, mintBtx] = await Promise.all([
        erc20Acontract.mint(amountA),
        erc20Bcontract.mint(amountB)
    ]);
    await Promise.all([ mintAtx.wait(), mintBtx.wait() ]);
    const [txTransferA, txTransferB] = await Promise.all([
        erc20Acontract.transfer(user.address, amountA),
        erc20Bcontract.transfer(user.address, amountB)
    ]);
    await Promise.all([ txTransferA.wait(), txTransferB.wait() ]);

    const [balanceAafter, balanceBafter] = await Promise.all([
        erc20Acontract.balanceOf(user.address),
        erc20Bcontract.balanceOf(user.address)
    ]);
    console.debug({ balanceAbefore, balanceAafter });
    console.debug({ balanceBbefore, balanceBafter });

    //approvals
    const txApproveA = await (erc20Acontract.connect(user) as Contract).approve(NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, balanceAafter);
    const txApproveB = await (erc20Bcontract.connect(user) as Contract).approve(NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, balanceBafter);

    await Promise.all([ txApproveA.wait(), txApproveB.wait() ]);
}

function buildMintTransaction(from: string, position: Position): TransactionRequest {
    const { calldata, value } = NonfungiblePositionManager.addCallParameters(
        position,
        getMintOptions(from)
    )
    console.debug({ calldata, value });
    return {
        data: calldata,
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        value: value,
        from,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    }
}

async function mintPosition(provider: JsonRpcProvider, user: Wallet, amountA: BigintIsh, amountB: BigintIsh): Promise<void> {

    console.log(`User's wallet address: ${user.address}`);
    const poolContract = getPoolContract(provider); 
    console.log(`Pool address: ${poolContract.address}`);
    const configuredPool = await getConfiguredPool(poolContract);

    await supplyAndApproveTokens(provider, user, amountA, amountB);

    const position = getPosition(configuredPool, amountA, amountB);
    const transaction = buildMintTransaction(user.address, position);

    const txRes = await user.sendTransaction(transaction);
    console.log({ txRes });

}

async function getPositionInfo(nfpmContract: Contract, positionHolder: string, positionInder: number): Promise<PositionInfo> {
    const tokenId = await nfpmContract.tokenOfOwnerByIndex(positionHolder, positionInder);
    console.debug({tokenId});
    const position = await nfpmContract.positions(tokenId);
    return {
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: position.liquidity,
        feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
        feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
        tokensOwed0: position.tokensOwed0,
        tokensOwed1: position.tokensOwed1
    }
}

(async function main() {
    const amountA: BigintIsh = "9990000000000";
    const amountB: BigintIsh = "10500090000000000000000000";
    const provider = new JsonRpcProvider(process.env['PROVIDER_RPC']);
    const user = new Wallet(USER_PRIVATE_KEY, provider);
    const nfpmContract = new ethers.Contract(
        NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        INONFUNGIBLE_POSITION_MANAGER.abi,
        provider
    );
    const numPositionsBefore = await nfpmContract.balanceOf(user.address)
    await mintPosition(provider, user, amountA, amountB);
    const numPositionsAfter = await nfpmContract.balanceOf(user.address)
    console.log({ numPositionsBefore, numPositionsAfter });
    const positionInfo = await getPositionInfo(nfpmContract, user.address, 0);
    console.log(positionInfo);
})()