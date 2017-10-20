import {MongoClient, ObjectId} from 'mongodb'
import express from 'express'
import bodyParser from 'body-parser'
import {graphqlExpress, graphiqlExpress} from 'graphql-server-express'
import {makeExecutableSchema} from 'graphql-tools'
import cors from 'cors'
import {
	GraphQLScalarType
} from 'graphql';

const URL = 'http://localhost'
const PORT = process.env.PORT || 3001;
const MONGO_URL = `mongodb://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_URL}:${process.env.DB_PORT}/${process.env.DB_NAME}`

const prepare = (o) => {
  o._id = o._id.toString()
  return o
}

export const start = async () => {
  try {
    const db = await MongoClient.connect(MONGO_URL)

    const logger = { log: (e) => console.log(e) }

    const Reports = db.collection('reports')

    const typeDefs = [`
      scalar Date
  
      type Query {
        report(_id: String): Report
        reports: [Report]
        reportsCloseBy(lat: Float, lng: Float, max: Int): [Report]
      }

      type Report {
        _id: String
        status: String
        date: Date
        source: String
        votes: Int
        location: Location
        placeName: String
      }

      type Location {
        type: String
        coordinates: [Float]
      }

      type Mutation {
        createReport(status: String, source: String, lat: Float, lng: Float, placeName: String): Report
        upVote(_id: String): Report
        downVote(_id: String): Report
      }

      schema {
        query: Query
        mutation: Mutation
      }
    `];

    const resolvers = {
      Date: new GraphQLScalarType({
        name: 'Date',
        description: 'Date custom scalar type',
        parseValue(value) {
          return new Date(value); // value from the client
        },
        serialize(value) {
          return value // value sent to the client
        },
        parseLiteral(ast) {
          if (ast.kind === Kind.INT) {
            return parseInt(ast.value, 10) // ast value is always in string format
          }
          return null;
        },
      }),
      Query: {
        report: async (root, {_id}) => {
          return prepare(await Reports.findOne(ObjectId(_id)))
        },
        reports: async () => {
          return (await Reports.find({}).toArray()).map(prepare)
        },
        reportsCloseBy: async (root, {lat, lng, max}) => {
          return (await Reports.find({
            location:
            { $near:
                {
                  $geometry: { type: "Point",  coordinates: [ lat, lng ] },
                  $maxDistance: max
                }
            }
          }).toArray()).map(prepare)
        }
      },
      Mutation: {
        createReport: async (root, args, context, info) => {
          const report = {
            status: args.status,
            date: new Date(),
            source: args.source,
            votes: 0,
            placeName: args.placeName,
            location: {
              type: "Point",
              coordinates: [args.lat, args.lng]
            }
          }

          const res = await Reports.insert(report)
          return prepare(await Reports.findOne({_id: res.insertedIds[1]}))
        },
        upVote: async (root, {_id}) => {
          const report = await Reports.update({_id: ObjectId(_id)}, {$inc: {votes: 1}})
          return prepare(await Reports.findOne(ObjectId(_id)))
        },
        downVote: async (root, {_id}) => {
          const report = await Reports.update({_id: ObjectId(_id)}, {$inc: {votes: -1}})
          return prepare(await Reports.findOne(ObjectId(_id)))
        },
      },
    }

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers,
      logger
    })

    const app = express()

    app.use(cors())

    app.use('/graphql', bodyParser.json(), graphqlExpress({schema}))

    app.use('/graphiql', graphiqlExpress({
      endpointURL: '/graphql'
    }))

    app.listen(PORT, () => {
      console.log(`Visit ${URL}:${PORT}`)
    })

  } catch (e) {
    console.log(e)
  }

}
