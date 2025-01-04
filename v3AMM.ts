import { AddLiquidityResult, PositionInfo, WithdrawLiquidityResult } from "./src/datatypes";
import { AddLiquidityDTO, WithdrawLiquidityDTO } from "./src/dtos";

export abstract class V3AMM {
    abstract addLiquidity(addLiquidityDTO: AddLiquidityDTO): Promise<AddLiquidityResult>;
    abstract withdrawLiquidity(withdrawLiquidityDTO: WithdrawLiquidityDTO): Promise<WithdrawLiquidityResult>;
    abstract positions(): Promise<PositionInfo[]>;
}