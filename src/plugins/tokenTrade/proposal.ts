import { DocumentNode } from 'graphql'
import gql from 'graphql-tag'
import { from, Observable } from 'rxjs'
import { concatMap } from 'rxjs/operators'
import { IEntityRef } from '../../entity'
import {
  Address,
  Arc,
  DAO,
  IApolloQueryOptions,
  IProposalState,
  ITransaction,
  Operation,
  Plugin,
  Proposal,
  toIOperationObservable,
  TokenTrade
} from '../../index'

export interface ITokenTradeProposalState extends IProposalState {
  dao: IEntityRef<DAO>
  beneficiary: Address
  sendTokenAddress: Address
  sendTokenAmount: number
  receiveTokenAddress: Address
  receiveTokenAmount: number
  executed: boolean
  redeemed: boolean
}

export class TokenTradeProposal extends Proposal<ITokenTradeProposalState> {

  public static get fragment() {
    if (!this.fragmentField) {
      this.fragmentField = {
        name: 'TokenTradeProposalFields',
        fragment: gql`
          fragment TokenTradeProposalFields on Proposal {
            tokenTrade {
              id
              dao { id }
              beneficiary
              sendTokenAddress
              sendTokenAmount
              receiveTokenAddress
              receiveTokenAmount
              executed
              redeemed
            }
          }
        `
      }
    }

    return this.fragmentField
  }

  public static itemMap(context: Arc, item: any, query?: string): ITokenTradeProposalState | null {

    if (!item) { return null }

    const tokenTradeState = TokenTrade.itemMap(context, item.scheme, query)

    if (!tokenTradeState) { return null }

    const tokenTrade = new TokenTrade(context, tokenTradeState)
    const tokenTradeProposal = new TokenTradeProposal(context, item.id)

    const baseState = Proposal.itemMapToBaseState(
      context,
      item,
      tokenTrade,
      tokenTradeProposal,
      'TokenTrade'
    )

    if (baseState == null) { return null }

    return {
      ...baseState,
      beneficiary: item.tokenTrade.beneficiary,
      sendTokenAddress: item.tokenTrade.sendTokenAddress,
      sendTokenAmount: item.tokenTrade.sendTokenAmount,
      receiveTokenAddress: item.tokenTrade.receiveTokenAddress,
      receiveTokenAmount: item.tokenTrade.receiveTokenAmount,
      executed: item.tokenTrade.executed,
      redeemed: item.tokenTrade.redeemed
    }
  }

  private static fragmentField: { name: string, fragment: DocumentNode } | undefined

  public state(apolloQueryOptions: IApolloQueryOptions): Observable<ITokenTradeProposalState> {
    const query = gql`query ProposalState
      {
        proposal(id: "${this.id}") {
          ...ProposalFields
          votes {
            id
          }
          stakes {
            id
          }
        }
      }
      ${Proposal.baseFragment}
      ${Plugin.baseFragment}
    `

    const result = this.context.getObservableObject(
      this.context, query, TokenTradeProposal.itemMap, this.id, apolloQueryOptions
      ) as Observable<ITokenTradeProposalState>
    return result
  }
  /**
   * Redeem this proposal after it was accepted
   */
  public redeem(): Operation<boolean> {
    const mapReceipt = () => true

    const createTransaction = async (): Promise<ITransaction> => {

      const state = await this.fetchState()
      const pluginState = await state.plugin.entity.fetchState()
      const pluginAddress = pluginState.address
      //  const pluginAddress = state.plugin.id
      const contract = this.context.getContract(pluginAddress)
      const method = 'execute'
      const args: any[] = [this.id]

      return {
        contract,
        method,
        args
      }
    }

    const observable = from(createTransaction()).pipe(
      concatMap((transaction: any) => {
        return this.context.sendTransaction(transaction, mapReceipt)
      })
    )

    return toIOperationObservable(observable)
  }

}
