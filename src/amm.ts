import { envs } from './config/env';
import { setUpFork } from './operations/setUpFork';
import { addLiquidity, collectAllFees, positions, reallocate, withdrawLiquidity } from './amm.core';

// eslint-disable-next-line
(BigInt.prototype as any).toJSON = function () {
	return this.toString();
};

(() => {
	void main();
})();

async function main(): Promise<void> {
	if (!envs.USER_PRIVATE_KEY) {
		throw new Error('Private key not provided');
	}
	if (!envs.PROVIDER_RPC) {
		throw new Error('Provider rpc is not defined');
	}

	switch (envs.COMMAND) {
		case 'positions':
			console.log('Active positions:');
			await positions();
			break;
		case 'addLiquidity':
			console.log('Adding liquidity: ');
			await addLiquidity();
			break;
		case 'reallocate':
			console.log('Reallocating liquidity to new price range: ');
			await reallocate(envs.POSITION_INDEX);
			break;
		case 'withdrawLiquidity':
			console.log('Withdrawing liquidity: ');
			await withdrawLiquidity(envs.POSITION_INDEX);
			break;
		case 'collectAllFees':
			console.log('Collectiong fees');
			await collectAllFees(envs.TOKEN_ID);
			break;
		case 'setUp':
			console.log('Preparing chain fork: ');
			await setUpFork((envs as Record<string, string>).CHAIN_ID);
			console.log('Chain state is ready');
			break;
		default:
			console.log(`unknown command ${envs.COMMAND}`);
	}
}

