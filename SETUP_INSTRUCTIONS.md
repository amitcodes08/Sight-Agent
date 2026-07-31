# SightAgent Setup & Run Instructions

SightAgent is an open-source visual AI agent built with a Chrome Extension frontend (Manifest V3) and a Node.js backend. It monitors user actions on the screen, captures screenshots and DOM changes, and sends this data to a backend powered by LangChain and Google's Gemini models for analysis.

Follow these step-by-step instructions to build and run the agent on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:
1. **Node.js**: Version 18.0.0 or higher.
2. **NPM**: Version 9.0.0 or higher (comes with Node).
3. **Google Chrome**: For installing the unpacked extension.
4. **Gemini API Key**: You need a valid API key from Google AI Studio to power the vision analysis.

---

## Step 1: Install Dependencies

Since SightAgent is structured as an NPM monorepo containing both the `backend` and `extension`, you can install everything from the root folder.

1. Open your terminal and navigate to the root of the project directory.
2. Run the install command:
   ```bash
   npm install
   ```

---

## Step 2: Configure the Environment

The backend requires a `.env` file to store your database connection string and your Gemini API key.

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Copy the example environment file to create your local `.env` file:
   ```bash
   cp .env.example .env
   ```
3. Open the `.env` file in your preferred text editor and replace `"your-gemini-api-key-here"` with your actual Gemini API key:
   ```env
   GEMINI_API_KEY="sk-..."
   ```
4. Return to the root directory:
   ```bash
   cd ..
   ```

---

## Step 3: Initialize the Database

SightAgent uses Prisma with a local SQLite database to store captured events and metadata.

1. From the root directory, generate the Prisma client and push the schema to the database:
   ```bash
   npm run db:generate -w backend
   npm run db:push -w backend
   ```

---

## Step 4: Build the Project

You need to build the extension and the backend.

1. From the root directory, run the comprehensive build command:
   ```bash
   npm run build
   ```
   *This command builds both the Vite-powered React extension and compiles the backend TypeScript code.*

---

## Step 5: Start the Development Servers

You can start both the backend server and the extension watch process simultaneously using a single command.

1. Run the dev command from the root directory:
   ```bash
   npm run dev
   ```
2. The terminal will display logs for both the backend (running on `http://localhost:3001`) and the Vite extension compiler. Keep this terminal open.

---

## Step 6: Load the Extension into Chrome

Now that the extension is built, you need to load it into your Chrome browser.

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` in the address bar.
3. In the top right corner, toggle **Developer mode** to the ON position.
4. Click the **Load unpacked** button in the top left.
5. In the file picker, select the `extension/dist` folder located inside your project directory.
6. The "SightAgent" extension will now appear in your list of extensions. Click the puzzle piece icon 🧩 in your Chrome toolbar and **pin** SightAgent for easy access.

---

## Step 7: Run the Agent!

You are now ready to use SightAgent.

1. Click the SightAgent icon in your Chrome toolbar to open the **Side Panel**.
2. Click the **Start Agent** button.
3. You will see a small "SightAgent" overlay appear in the bottom right corner of the active webpage, indicating that monitoring is active.
4. Navigate around the web page, click buttons, or type in inputs. 
5. Check your terminal! You will see backend logs indicating that events and screenshots are being ingested and actively analyzed by the Gemini VLM. 
6. (Optional) You can view the raw saved events and analysis results in the database using Prisma Studio by running `npm run db:studio -w backend` in a separate terminal.
