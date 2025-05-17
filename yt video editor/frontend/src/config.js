const config = {
  apiUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000'
};

// Log the API URL being used (but not in production)
if (import.meta.env.DEV) {
  console.log('API URL:', config.apiUrl);
}

export default config; 
