const express = require('express');
require('dotenv').config()
const cors = require('cors')
const app = express()
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const port = process.env.PORT || 5000;


// middleware
const corsOptions = {
    origin: ['http://localhost:5173',],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ifklbg0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// const verifyToken = async(req, res, next) => {
//     const token = req.cookies?.token;
//     console.log(token);
//     if(!token){
//        return res.status(401).send({message: "Unauthorized access"})
//     }
//     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//         if(err){
//             return res.status(401).send({message: "Unauthorized access"})
//         }
//         req.user = decoded;
//         next()
//     })

// }

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const usersCollection = client.db('contestCornerDB').collection('users');
        const contestsCollection = client.db('contestCornerDB').collection('contests');
        // auth related api
        app.post('/jwt', async (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })
        // Logout
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
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
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })
        // get all the contest 
        app.get('/contests', async (req, res) => {
            const result = await contestsCollection.find().toArray()
            res.send(result)
        })
        // get a single data for details 
        app.get('/contestDetails/:id', async (req, res) => {
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
        // role management api 
        // get user role 
        app.get('/user/:email', async (req, res) => {
            const email = req.params.email;
            const result = await usersCollection.findOne({ email: email })
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