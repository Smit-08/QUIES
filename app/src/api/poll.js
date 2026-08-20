import apiClient from './client';

export async function poll(jobId, { intervalMs = 3000, maxAttempts = 40 } = {}) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { data } = await apiClient.get(`/jobs/${jobId}`);
        if (data.status === 'complete') return { success: true, result: data.result };
        if (data.status === 'failed') return { success: false, error: data.error };
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return { success: false, error: { message: 'Polling timed out' } };
}