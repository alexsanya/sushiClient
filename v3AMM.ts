import { type AddLiquidityResult, type PositionInfo, type WithdrawLiquidityResult } from './src/datatypes';
import { type LiquidityDTO } from './src/dtos';

export abstract class V3AMM {
	abstract addLiquidity(addLiquidityDTO: LiquidityDTO): Promise<AddLiquidityResult>;
	abstract withdrawLiquidity(withdrawLiquidityDTO: LiquidityDTO): Promise<WithdrawLiquidityResult>;
	abstract positions(): Promise<PositionInfo[]>;
}
