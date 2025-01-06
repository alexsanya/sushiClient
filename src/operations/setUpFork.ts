import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { envs } from '../config/env';
import { CHAIN_CONFIGS } from '../chains';
import { ERC20_ABI } from '../../abis/erc20';

export async function setUpFork(chainId: string): Promise<void> {
	if (typeof envs.PROVIDER_RPC !== 'string') {
		throw new Error('PROVIDER_RPC is not provided');
	}
	if (typeof envs.USER_PRIVATE_KEY !== 'string') {
		throw new Error('USER_PRIVATE_KEY is not provided');
	}
	const provider = new JsonRpcProvider(envs.PROVIDER_RPC);

	const {
		TOKEN_A_ADDRESS,
		TOKEN_B_ADDRESS,
		TOKEN_A_MINTER_ADDRESS,
		TOKEN_B_MINTER_ADDRESS,
		AMOUNT_A,
		AMOUNT_B,
		NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS
	} = CHAIN_CONFIGS[chainId];

	// Impersonate the token minter
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
	const user = new Wallet(envs.USER_PRIVATE_KEY, provider);
	const { address } = user;
	const [balanceAbefore, balanceBbefore] = await Promise.all([
		erc20Acontract.balanceOf(address),
		erc20Bcontract.balanceOf(address)
	]);
	// mint and transfer
	const mintAtx = await erc20Acontract.mint(AMOUNT_A);
	await mintAtx.wait();
	const mintBtx = await erc20Bcontract.mint(AMOUNT_B);
	await mintBtx.wait();
	const txTransferA = await erc20Acontract.transfer(address, AMOUNT_A);
	await txTransferA.wait();
	const txTransferB = await erc20Bcontract.transfer(address, AMOUNT_B);
	await txTransferB.wait();

	const [balanceAafter, balanceBafter]: bigint[] = await Promise.all([
		erc20Acontract.balanceOf(address),
		erc20Bcontract.balanceOf(address)
	]);
	console.debug({ balanceAbefore, balanceAafter });
	console.debug({ balanceBbefore, balanceBafter });

	// approvals
	const txApproveA = await (erc20Acontract.connect(user) as Contract).approve(
		NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
		balanceAafter
	);
	await txApproveA.wait();
	const txApproveB = await (erc20Bcontract.connect(user) as Contract).approve(
		NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
		balanceBafter
	);
	await txApproveB.wait();
}
