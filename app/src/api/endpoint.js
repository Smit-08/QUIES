import apiClient from './client';
import { poll } from './poll';

export async function startScan(deviceInfo) {
    const { data } = await apiClient.post('/scan', deviceInfo);
    return poll(data.job_id);
}
export async function getRiskScore() {
    const { data } = await apiClient.get('/risk-score');
    return data;
}
export async function getHistory(page = 1) {
    const { data } = await apiClient.get(`/history?page=${page}`);
    return data;
}
export async function uploadEvidence(fileFormData) {
    const { data } = await apiClient.post('/evidence', fileFormData, { headers: { 'Content-Type': 'multipart/form-data' } });
    return poll(data.job_id);
}
export async function sendChatMessage(message, conversationHistory) {
    const { data } = await apiClient.post('/chat', { message, conversation_history: conversationHistory });
    return poll(data.job_id);
}
export async function generateReport(evidenceIds, scanHistoryIds) {
    const { data } = await apiClient.post('/report', { evidence: evidenceIds, scan_history: scanHistoryIds });
    return poll(data.job_id);
}
export async function syncAuth(userInfo) {
    const { data } = await apiClient.post('/auth/sync', userInfo);
    return data;
}