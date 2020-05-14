import { DocumentNode } from 'graphql'
import gql from 'graphql-tag'
import { Observable } from 'rxjs'
import {
  AnyProposal,
  Arc,
  createGraphQlQuery,
  Entity,
  IApolloQueryOptions,
  ICommonQueryOptions,
  IEntityRef,
  Logger,
  Plugins,
  Proposals
} from './index'

export interface ITagState {
  id: string
  numberOfProposals: number
  proposals?: Array<IEntityRef<AnyProposal>>
}

export interface ITagQueryOptions extends ICommonQueryOptions {
  where?: {
    id?: string
    proposal?: string
  }
}

export class Tag extends Entity<ITagState> {
  public static fragments = {
    TagFields: gql`
      fragment TagFields on Tag {
        id
        numberOfProposals
        proposals {
          id
          scheme {
            id
            name
          }
        }
      }
    `
  }

  public static search(
    context: Arc,
    options: ITagQueryOptions = {},
    apolloQueryOptions: IApolloQueryOptions = {}
  ): Observable<Tag[]> {
    if (!options.where) {
      options.where = {}
    }
    let where = ''

    const itemMap = (arc: Arc, item: any, queriedId?: string) => {
      const state = Tag.itemMap(arc, item, queriedId)
      return new Tag(arc, state)
    }

    const proposalId = options.where.proposal
    // if we are searching for stakes on a specific proposal (a common case), we
    // will structure the query so that stakes are stored in the cache together wit the proposal
    if (proposalId) {
      delete options.where.proposal
    }

    for (let key of Object.keys(options.where)) {
      if (options.where[key] === undefined) {
        continue
      }

      // TODO: remove once this issue is closed https://github.com/daostack/subgraph/issues/537
      const value = options.where[key]
      key = key.replace('plugin', 'scheme')
      key = key.replace('Plugin', 'Scheme')
      options.where[key] = value

      if (Array.isArray(options.where[key])) {
        // Support for operators like _in
        const values = options.where[key].map((val: number) => '"' + val + '"')
        where += `${key}: [${values.join(',')}]\n`
      } else {
        where += `${key}: "${options.where[key] as string}"\n`
      }
    }

    let query: DocumentNode

    if (proposalId) {
      query = gql`query TagsSearchFromProposal
        {
          proposal (id: "${proposalId}") {
            id
            scheme {
              id
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
        (arc: Arc, r: any, queriedId?: string) => {
          if (!r) {
            // no such proposal was found
            return []
          }
          const itemMapper = (item: any) => {
            const state = Tag.itemMap(arc, item, queriedId)
            return new Tag(arc, state)
          }
          return r.tags.map(itemMapper)
        },
        options.where?.id,
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

      return context.getObservableList(context, query, itemMap, options.where?.id, apolloQueryOptions) as Observable<
        Tag[]
      >
    }
  }

  public static itemMap = (context: Arc, item: any, queriedId?: string): ITagState => {
    if (!item) {
      throw Error(`Tag ItemMap failed. ${queriedId ? `Could not find Tag with id '${queriedId}'` : ''}`)
    }

    return {
      id: item.id,
      numberOfProposals: Number(item.numberOfProposals),
      proposals: item.proposals.map((proposal: any) => {

        if (!Object.keys(Plugins).includes(proposal.scheme.name)) {
          Logger.debug(
            `Proposal's Plugin name '${proposal.scheme.name}' not supported. Instantiating it as Unknown Proposal.`
          )
          proposal.scheme.name = 'Unknown'
        }

        if (proposal.scheme.name === 'ContributionRewardExt') {
          if (proposal.competition) {
            proposal.scheme.name = 'Competition'
          }
        }

        return {
          id: proposal.id,
          entity: new Proposals[proposal.scheme.name](context, proposal.id)
        }
      })
    }
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

    return this.context.getObservableObject(this.context, query, Tag.itemMap, this.id, apolloQueryOptions)
  }
}
