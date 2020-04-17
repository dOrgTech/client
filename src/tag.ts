import gql from 'graphql-tag'
import { Observable } from 'rxjs'
import {
  Arc,
  IApolloQueryOptions,
  createGraphQlQuery,
  Entity,
  IEntityRef,
  Proposals,
  AnyProposal,
  ICommonQueryOptions
} from './index'

export interface ITagState {
  id: string
  numberOfProposals: number
  proposals?: IEntityRef<AnyProposal>[]
}

export interface ITagQueryOptions extends ICommonQueryOptions {
  where?: {
    id?: string,
    proposal?: string
  }
}

export class Tag extends Entity<ITagState> {
  public static fragments = {
    TagFields: gql`fragment TagFields on Tag {
      id
      numberOfProposals
      proposals { 
        id
        scheme {
          name
        }
      }
    }`
  }

  public static search(
    context: Arc,
    options: ITagQueryOptions = {},
    apolloQueryOptions: IApolloQueryOptions = {}
  ): Observable <Tag[]> {
    if (!options.where) { options.where = {}}
    let where = ''

    const proposalId = options.where.proposal
    // if we are searching for stakes on a specific proposal (a common case), we
    // will structure the query so that stakes are stored in the cache together wit the proposal
    if (proposalId) {
      delete options.where.proposal
    }

    for (const key of Object.keys(options.where)) {
      if (options.where[key] === undefined) {
        continue
      }
      where += `${key}: "${options.where[key] as string}"\n`
    }

    let query

    if (proposalId) {
      query = gql`query TagsSearchFromProposal
        {
          proposal (id: "${proposalId}") {
            id
            scheme {
              name
            }
            tags ${createGraphQlQuery(options, where)} {
              ...TagFields
            }
          }
        }
        ${Tag.fragments.TagFields}
      `

      return context.getObservableObject(
        context,
        query,
        (context: Arc, r: any) => {
          if (r === null) { // no such proposal was found
            return []
          }
          const itemMap = (item: any) => Tag.itemMap(context, item)
          return r.tags.map(itemMap)
        },
        apolloQueryOptions
      ) as Observable<Tag[]>
    } else {
      query = gql`query TagsSearch
        {
          tags ${createGraphQlQuery(options, where)} {
              ...TagFields
          }
        }
        ${Tag.fragments.TagFields}
      `

      return context.getObservableList(
        context,
        query,
        Tag.itemMap,
        apolloQueryOptions
      ) as Observable<Tag[]>
    }
  }

  public static itemMap = (context: Arc, item: any): Tag => {
    if (item === null) {
      //TODO: How to get ID for this error msg?
      throw Error(`Could not find a Tag with id`)
    }

    return new Tag(context, {
      id: item.id,
      numberOfProposals: Number(item.numberOfProposals),
      proposals: item.proposals.map((proposal: any) => {
        return {
          id: proposal.id,
          entity: new Proposals[proposal.scheme.name](context, proposal.id)
        }
      })
    })
  }

  public state(apolloQueryOptions: IApolloQueryOptions = {}): Observable<ITagState> {
    const query = gql`query TagState
      {
        tag (id: "${this.id}") {
          ...TagFields
        }
      }
      ${Tag.fragments.TagFields}
    `

    return this.context.getObservableObject(this.context, query, Tag.itemMap, apolloQueryOptions)
  }
}
