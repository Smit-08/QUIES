import axios from 'axios';
import { getAuth } from 'firebase/auth';

const BASE_URL = 'http://localhost:3000/api';

const apiClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });

apiClient.interceptors.request.use(async (config) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user) {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default apiClient;