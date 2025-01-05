import * as sepoliaData from './sepolia';
import * as bscData from './bsc';

export const CHAIN_CONFIGS = {
	[sepoliaData.CHAIN_ID]: sepoliaData,
	[bscData.CHAIN_ID]: bscData
};
