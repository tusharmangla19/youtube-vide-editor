const config = {
  apiUrl: import.meta.env.PROD 
    ? 'https://your-backend-url.onrender.com'  // Replace with your actual Render backend URL
    : 'http://localhost:5000'
};

export default config; 