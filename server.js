const express = require('express');
const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 9876;
const WINDOW_SIZE = 10;
const CACHE_DURATION = 500; // Cache duration in milliseconds

const localStoragePath = path.join(__dirname, 'localStorage.json');

let lastFetchTime = 0;

// Access token from environment variables
const accessToken = process.env.ACCESS_TOKEN;

// Middleware to parse JSON requests
app.use(express.json());

// Function to read state from local storage
const readStateFromLocalStorage = () => {
  try {
    if (fs.existsSync(localStoragePath)) {
      const data = fs.readFileSync(localStoragePath);
      return JSON.parse(data);
    }
    return { numberWindow: [], numberSet: [] };
  } catch (error) {
    console.error('Error reading state from local storage:', error.message);
    return { numberWindow: [], numberSet: [] };
  }
};

// Function to write state to local storage
const writeStateToLocalStorage = (state) => {
  try {
    fs.writeFileSync(localStoragePath, JSON.stringify(state));
  } catch (error) {
    console.error('Error writing state to local storage:', error.message);
  }
};

// Function to fetch numbers from the third-party server
const fetchNumbers = async (numberid) => {
  try {
    const response = await axios.get(`https://third-party-server/numbers/${numberid}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      timeout: 500 // 
    });

    if (response.data && Array.isArray(response.data.numbers)) {
      return response.data.numbers;
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Error fetching numbers:', error.message);
    return [];
  }
};


const updateNumberWindow = (numberWindow, numberSet, newNumbers) => {
  newNumbers.forEach(num => {
    if (!numberSet.has(num)) {
      if (numberWindow.length >= WINDOW_SIZE) {
        const removed = numberWindow.shift();
        numberSet.delete(removed);
      }
      numberWindow.push(num);
      numberSet.add(num);
    }
  });
};

app.get('/numbers/:numberid', async (req, res) => {
  const { numberid } = req.params;
  if (!['p', 'f', 'e', 'r'].includes(numberid)) {
    return res.status(400).json({ error: 'Invalid number ID' });
  }

  const now = performance.now();
  if (now - lastFetchTime < CACHE_DURATION) {
   
    const { numberWindow, numberSet } = readStateFromLocalStorage();
    return res.json({
      windowPrevState: numberWindow,
      windowCurrState: numberWindow,
      numbers: [],
      avg: (numberWindow.reduce((acc, num) => acc + num, 0) / numberWindow.length).toFixed(2)
    });
  }

  lastFetchTime = now;

  let numberWindow = [];
  let numberSet = new Set();
  const { numberWindow: prevWindow, numberSet: prevSet } = readStateFromLocalStorage();
  numberWindow = [...prevWindow];
  numberSet = new Set(prevSet);

  try {
    const newNumbers = await fetchNumbers(numberid);
    updateNumberWindow(numberWindow, numberSet, newNumbers);
    writeStateToLocalStorage({ numberWindow, numberSet: [...numberSet] });
    
    const sum = numberWindow.reduce((acc, num) => acc + num, 0);
    const avg = numberWindow.length > 0 ? (sum / numberWindow.length).toFixed(2) : 0;

    res.json({
      windowPrevState: prevWindow,
      windowCurrState: numberWindow,
      numbers: newNumbers,
      avg
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error fetching data from third-party server' });
  }
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
