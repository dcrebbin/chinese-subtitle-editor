export interface User extends ApiUser {
  speechTokensGenerated: number;
  textTokensGenerated: number;
  audioTokensGenerated: number;
  uid: string;
  subscriptionExpiryDate: string;
}

export interface ApiUser {
  email: string;
  resetDate: string;
  name: string;
  usageLeft: number;
  membershipType: number;
  latestTransactionIdIos: string;
  subscriptionCode: string;
}
