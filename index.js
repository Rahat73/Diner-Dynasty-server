const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_SK);
const nodemailer = require("nodemailer");
const mg = require("nodemailer-mailgun-transport");
const app = express();
const port = process.env.PORT || 5000;

//middlewares
app.use(cors());
app.use(express.json());

const auth = {
  auth: {
    api_key: process.env.EMAIL_KEY,
    domain: process.env.EMAIL_DOMAIN,
  },
};

const nodemailerMailgun = nodemailer.createTransport(mg(auth));

const sendPaymentConfirmationEmail = (paymentInfo) => {
  nodemailerMailgun.sendMail(
    {
      from: "rahat.ashik.18@gmail.com",
      to: "rahat.ashik.18@gmail.com", // An array if you have multiple recipients.
      subject: "Yor order has been placed",
      //You can use "html:" to send HTML email content. It's magic!
      html: `<div>
      <h3>Payment has been confirmed</h3>
      <h4>Your order has been placed</h4>
      <br>
      <p>Transaction ID: ${paymentInfo.transactionId}</p>
      <span>Name: ${paymentInfo.name}</span>
      <span>Email: ${paymentInfo.email}</span>
      <br>
      <p>Price: $ ${paymentInfo.price}</p>
      <div>`,
    },
    (err, info) => {
      if (err) {
        console.log(`Error: ${err}`);
      } else {
        console.log(`Response: ${info}`);
      }
    }
  );
};

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oahoku5.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db("DinerDynasty").collection("Users");
    const menusCollection = client.db("DinerDynasty").collection("Menus");
    const reviewsCollection = client.db("DinerDynasty").collection("Reviews");
    const cartsCollection = client.db("DinerDynasty").collection("Carts");
    const paymentsCollection = client.db("DinerDynasty").collection("Payments");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { userEmail: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      next();
    };

    ////////////////////////JWT////////////////////////
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    ////////////////////////JWT////////////////////////

    //----------------------------------------------------------------------------//

    ////////////////////////UsersCollection////////////////////////
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { userEmail: user.userEmail };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.send({ admin: false });
      }
      const query = { userEmail: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    ////////////////////////UsersCollection////////////////////////

    //----------------------------------------------------------------------------//

    ////////////////////////MenusCollection////////////////////////
    app.get("/menus", async (req, res) => {
      const result = await menusCollection.find().toArray();
      res.send(result);
    });

    app.post("/menus", verifyJWT, verifyAdmin, async (req, res) => {
      const newItem = req.body;
      const result = await menusCollection.insertOne(newItem);
      res.send(result);
    });

    app.delete("/menus/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menusCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/menus/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { name, category, price, recipe, image } = req.body;
      const updateDoc = {
        $set: {
          name,
          category,
          price,
          recipe,
          image,
        },
      };
      const result = await menusCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    ////////////////////////MenusCollection////////////////////////

    //----------------------------------------------------------------------------//

    ////////////////////////ReviewsCollection////////////////////////
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });
    ////////////////////////ReviewsCollection////////////////////////

    //----------------------------------------------------------------------------//

    ////////////////////////CartsCollection////////////////////////
    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (decodedEmail !== email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }
      const query = { userEmail: email };
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const item = req.body;
      const result = await cartsCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });
    ////////////////////////CartsCollection////////////////////////

    //----------------------------------------------------------------------------//

    ////////////////////////PaymentsCollection////////////////////////
    app.post("/payments", verifyJWT, async (req, res) => {
      const paymentInfo = req.body;

      if (req.decoded.email !== paymentInfo.email) {
        return res
          .status(403)
          .send({ error: true, message: "forbidden access" });
      }

      const insertResult = await paymentsCollection.insertOne(paymentInfo);

      const query = {
        _id: { $in: paymentInfo.cartItems.map((id) => new ObjectId(id)) },
      };
      const deletedResult = await cartsCollection.deleteMany(query);

      sendPaymentConfirmationEmail(paymentInfo);

      res.send({ insertResult, deletedResult });
    });
    ////////////////////////PaymentsCollection////////////////////////

    //----------------------------------------------------------------------------//

    ////////////////////////PaymentIntent////////////////////////
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    ////////////////////////PaymentIntent////////////////////////

    //----------------------------------------------------------------------------//

    ////////////////////////AdminStats////////////////////////
    app.get("/admin-stats", verifyJWT, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const menus = await menusCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();
      const revenueAggregate = await paymentsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: "$price" },
            },
          },
        ])
        .toArray();
      const revenue =
        revenueAggregate.length > 0 ? revenueAggregate[0].total : 0;
      res.send({ users, menus, orders, revenue });
    });

    app.get("/order-stats", verifyJWT, verifyAdmin, async (req, res) => {
      // Aggregate the total price per category
      const categoryTotalPricesAndCounts = await paymentsCollection
        .aggregate([
          {
            $unwind: "$menuItems", // Split the array of menu items into separate documents
          },
          {
            $lookup: {
              from: "Menus",
              localField: "menuItems",
              foreignField: "_id",
              as: "menuDetails",
            },
          },
          {
            $unwind: "$menuDetails", // Unwind the menuDetails array
          },
          {
            $group: {
              _id: "$menuDetails.category",
              total: { $sum: "$menuDetails.price" },
              itemCount: { $sum: 1 }, // Count the items in each category
            },
          },
          {
            $project: {
              _id: 0, // Exclude _id field
              category: "$_id", // Rename _id to category
              total: { $round: ["$total", 2] }, // Round total to 2 decimal places
              itemCount: 1, // Include itemCount field
            },
          },
        ])
        .toArray();

      res.send(categoryTotalPricesAndCounts);
    });

    ////////////////////////AdminStats////////////////////////

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Diner Dynasty is running");
});

app.listen(port, () => {
  console.log(`Diner Dynasty is running on port: ${port}`);
});
