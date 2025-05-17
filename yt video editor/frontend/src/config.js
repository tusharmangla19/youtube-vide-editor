const config = {
  apiUrl: import.meta.env.PROD 
    ? process.env.VITE_BACKEND_URL || 'http://localhost:5000'
    : 'http://localhost:5000'
};

export default config; 
