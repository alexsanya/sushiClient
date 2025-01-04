import JSBI from "jsbi"

export interface PositionInfo {
    tickLower: number
    tickUpper: number
    liquidity: JSBI
    feeGrowthInside0LastX128: JSBI
    feeGrowthInside1LastX128: JSBI
    tokensOwed0: JSBI
    tokensOwed1: JSBI
}