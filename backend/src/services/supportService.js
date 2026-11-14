import api from './api';

export const createSupportTicket = (category, message) =>
  api.post('/support', { category, message });