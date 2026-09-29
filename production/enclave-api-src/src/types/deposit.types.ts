export type DecodedDeposit = {
  erc20Addresses: string[];
  amounts: string[];
};

export type DecodedOrder = {
  orderId: string;
  deposit: DecodedDeposit | null;
};
