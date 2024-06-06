const express = require('express');
require('dotenv').config()
const cors = require('cors')
const app = express()
const jwt = require('jsonwebtoken')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require("stripe")(process.env.STRIPE_SK)
const port = process.env.PORT || 5000;


// middleware
const corsOptions = {
    origin: ['http://localhost:5173',],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ifklbg0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});
// middlewere
const verifyToken = (req, res, next) => {
    if (!req.headers) {
        return res.status(401).send({ message: "Unauthorized access" })
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRETS, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}
async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const usersCollection = client.db('contestCornerDB').collection('users');
        const contestsCollection = client.db('contestCornerDB').collection('contests');
        const paymentsCollection = client.db('contestCornerDB').collection('payments')
        const taskSubmittedCollection = client.db('contestCornerDB').collection('taskSubmits')
        // jwt api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRETS, { expiresIn: '2h' })
            res.send({ token })
        })
        // user related api 
        app.put('/user', async (req, res) => {
            const user = req.body;
            // if user already exists
            const query = { email: user?.email }
            const isExist = await usersCollection.findOne(query)
            if (isExist) {
                return res.send(isExist)
            }
            const filter = { email: user?.email }
            const options = { upsert: true }
            const updateDoc = {
                $set: {
                    ...user,
                    timeStamp: Date.now()
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            res.send(result)
        })

        // task submit related api 
        app.post('/submittedTask', async (req, res) => {
            const submitData = req.body;
            const result = await taskSubmittedCollection.insertOne(submitData)
            res.send(result);
        })

        // get all the submit data 
        app.get('/submittedTask', async (req, res) => {
            const result = await taskSubmittedCollection.find().toArray()
            res.send(result)
        })
        // declare win
        app.patch('/declareWin', async (req, res) => {
            const id = req.query.id;
            const updateData = req.body;
            const filter = { contestId: id }
            const updateDoc = {
                $set: {
                    ...updateData
                }
            }
            const result = await taskSubmittedCollection.updateMany(filter, updateDoc)
            const anotherUpdate = await contestsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { contestResult: updateData?.contestResult, winnerName: updateData?.winnerName, winnerImg: updateData?.winnerImg } })
            const anotherUpdates = await paymentsCollection.updateMany({ contestId: id }, { $set: { contestResult: updateData?.contestResult, winnerEmail: updateData?.winnerEmail } })
            res.send(result)
        })
        // get the latest winner 
        app.get('/latestWinner', async (req, res) => {
            const result = await contestsCollection.find({ contestResult: 'Declared Winner' }).sort({ _id: -1 }).limit(1).toArray();
            res.send(result)
        })
        // get the top 5 contest creators
        app.get('/topCreators', async (req, res) => {
            const query = {
                participation: {
                    $gt: 0
                }
            }
            const result = await contestsCollection.find(query).sort({ participation: -1 }).limit(4).toArray()
            res.send(result)
        })
        // get user win or lose rate 
        app.get('/userWin/:email', async (req, res) => {
            const participantEmail = req.params.email;
            const pipeline = [
                {
                    $match: { participantEmail } // Filter tasks by the given participant email
                },
                {
                    $lookup: {
                        from: 'payments',
                        localField: 'participantEmail',
                        foreignField: 'participantEmail',
                        as: 'payments'
                    }
                },
                {
                    $facet: {
                        attempted: [
                            { $count: "attemptedCount" }
                        ],
                        completed: [
                            { $match: { winnerEmail: participantEmail } },
                            { $count: "completedCount" }
                        ]
                    }
                },
                {
                    $project: {
                        attemptedCount: { $ifNull: [{ $arrayElemAt: ["$attempted.attemptedCount", 0] }, 0] },
                        completedCount: { $ifNull: [{ $arrayElemAt: ["$completed.completedCount", 0] }, 0] }
                    }
                }
            ];
            const result = await taskSubmittedCollection.aggregate(pipeline).toArray();
            res.send({ attemptedCount: result[0].attemptedCount, completedCount: result[0].completedCount })

        })
        // get all submission for a single contest
        app.get('/contestSubmitDetails/:id', async (req, res) => {
            const id = req.params.id;
            const query = { contestId: id }
            const result = await taskSubmittedCollection.find(query).toArray()
            res.send(result)
        })
        // get win contest for user 
        app.get('/winningContest/:email', async (req, res) => {
            const email = req.params.email;
            const result = await taskSubmittedCollection.find({ winnerEmail: email }).toArray();
            res.send(result)
        })
        // update user 
        app.put('/user/update/:email', async (req, res) => {
            const email = req.params.email;
            const updateInfo = req.body;
            const query = { email: email }
            const updateDoc = {
                $set: {
                    address: updateInfo?.address,
                    name: updateInfo?.name,
                    img: updateInfo?.img_url,
                }
            }
            const result = await usersCollection.updateOne(query, updateDoc)
            res.send(result)
        })
        // get a user data 
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const result = await usersCollection.findOne({ email })
            res.send(result)
        })
        // update user role
        app.patch('/user/update/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email }
            const updateDoc = {
                $set: {
                    ...user, timeStamp: new Date()
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            res.send(result)
        })
        // delete a user
        app.delete('/user/delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })
        // get all the users
        app.get('/users', verifyToken, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })
        // get all the contest 
        app.get('/contests', async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const result = await contestsCollection.find().skip(page * size).limit(size).toArray()
            res.send(result)
        })
        // get search data 
        app.get('/contests/search', async (req, res) => {
            const value = req.query.value;
            if (!value || value === '') return
            const regex = new RegExp(value, 'i')
            const searchResult = await contestsCollection.find({ tags: { $regex: regex } }).toArray()
            return res.send(searchResult)
        })
        // get popular contest
        app.get('/popularContests', async (req, res) => {
            const query = { participation: -1 }
            const result = await contestsCollection.find().sort(query).toArray()
            res.send(result)
        })
        // number of contests
        app.get('/contestCount', async (req, res) => {
            const result = await contestsCollection.estimatedDocumentCount()
            res.send({ count: result })
        })
        // get a single data for details 
        app.get('/contestDetails/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await contestsCollection.findOne(query)
            res.send(result);
        })
        // edit contest 
        app.get('/editContest/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await contestsCollection.findOne(query)
            res.send(result);
        })
        // get a single data for details 
        app.get('/payment/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await contestsCollection.findOne(query)
            res.send(result);
        })
        // update contest status or approved contest
        app.patch('/contests/update/:id', async (req, res) => {
            const id = req.params.id;
            const contest = req.body;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    ...contest,
                }
            }
            const result = await contestsCollection.updateOne(filter, updateDoc)
            res.send(result)
        })
        // delete a contest 
        app.delete('/contests/delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await contestsCollection.deleteOne(query)
            res.send(result)
        })
        // add contest
        app.post('/addContest', async (req, res) => {
            const contestData = req.body;
            const result = await contestsCollection.insertOne(contestData)
            res.send(result)
        })
        // admin related api 
        app.patch('/updateContest', async (req, res) => {
            const id = req.params.id;
            const query = { _id: id }
            const result = await contestsCollection.updateOne(query)
            res.send(result)
        })
        // get specific user contest data 
        app.get('/myContest/:email', async (req, res) => {
            const email = req.params.email;
            const query = { creatorEmail: email }
            const result = await contestsCollection.find(query).toArray()
            res.send(result)
        })
        // role management api 
        // get user role 
        app.get('/user/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const result = await usersCollection.findOne({ email: email })
            res.send(result)
        })
        // payment related api 
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100)
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
                automatic_payment_methods: {
                    enabled: true,
                },
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        // store the payment data on db
        app.post('/payments', async (req, res) => {
            const paymentData = req.body;
            const result = await paymentsCollection.insertOne(paymentData)
            const updateComment = await contestsCollection.updateOne({
                _id: new ObjectId(paymentData?.contestId)
            },
                {
                    $inc: {
                        participation: 1
                    }
                }
            )
            res.send(result)
        })
        // get user payment
        app.get('/payments/:email', async (req, res) => {
            const email = req.params.email;
            const query = { participantEmail: email }
            const result = await paymentsCollection.find(query).toArray()
            res.send(result)
        })

        // implement leader board
        app.get('/leaderBoard', async(req, res) => {
            const result = await taskSubmittedCollection.aggregate([
                {
                    $match: {contestResult: 'Declared Winner'}
                },
                {
                    $group: {
                        _id: '$winnerEmail',
                        winCount: {$sum: 1}
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: 'email',
                        as: 'userDetails'
                    }
                },
                {
                    $unwind: "$userDetails"
                },
                {
                    $project: {
                      _id: 0,
                      name: "$userDetails.name",
                      email: "$_id",
                      winCount: 1
                    }
                  },
                  {
                    $sort: { winCount: -1 }
                  }
            ]).toArray();
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    const result = "Hello from Contest Corner server";
    res.send(result)
})
app.listen(port, () => {
    console.log(`Contest Corner server is running on port: ${port}`);
})