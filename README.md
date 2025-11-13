Resource Booking System

A full-stack web application designed to streamline the reservation and management of resources (such as rooms, equipment, or facilities). Built with React on the frontend and Node.js + Express + Prisma on the backend, fully powered by a PostgreSQL database.

Features

Admin

Manage resources (add, edit, delete), view all bookings, approve/reject reservation requests, manage users/roles, and Dashboard overview with analytics.


 User
 
Create an account & login, Browse available resources, Submit booking requests, View booking status (pending/approved / rejected), Update or cancel bookings

Authentication

Secure login system
Password hashing using bcryptjs
JSON Web Tokens (JWT) for session handling

Database

PostgreSQL database
Schema managed with Prisma ORM
Relations for users, resources, and bookings

Tech Stack

Frontend
React
Vite
TailwindCSS
Radix UI Components
Backend
Node.js
Express.js
Prisma ORM
PostgreSQL

CORS
Express-Session / JWT Authentication
Helmet for security
Morgan for logging

Project Structure
resource-booking/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── utils/
│   │   └── index.ts
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   └── package.json
│
└── README.md




Installation & Setup Prerequisites

Make sure you have installed:
Node.js (v18 or higher)
PostgreSQL
Git

Clone the Repository
git clone https://github.com/Drewww17/Programming_Language_M3_SA.git
cd Programming_Language_M3_SA


Backend Setup

1. Go to backend folder
cd backend
2. Install dependencies
npm install
3. Create a .env file
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/yourdb"
SESSION_SECRET="any-random-string"
4. Run database migrations
npx prisma migrate dev --name init
5. Start backend server
npm run dev


Backend runs on:
http://localhost:5178
 (example if using your setup)
or the port defined inside index.ts.

Frontend Setup
1. Go to frontend folder
cd ../frontend
2. Install dependencies
npm install
3. Start frontend
npm run dev

API Endpoints
Auth
Method	      Endpoint	      Description
POST	    /auth/register	  Register new user
POST	    /auth/login	      Login user
GET	     /auth/me	      Get current user

Resources
Method	Endpoint	     Description
GET	   /resources	    Get all resources
POST	/resources	    Create resource (admin)
PUT	/resources/:id	  Update resource
DELETE	/resources/:id	Delete resource

Booking Method	
Endpoint	          Description
POST	/bookings	                Create booking
GET	/bookings/user	           Get user bookings
GET	/bookings/all	            Admin: view all bookings
PUT	/bookings/:id/status	   Admin: approve / reject

Frontend runs on:
http://localhost:5173
