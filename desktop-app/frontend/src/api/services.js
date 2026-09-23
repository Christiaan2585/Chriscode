import apiClient from './client';

export const clientService = {
  getAll: async () => {
    const response = await apiClient.get('/clients/');
    return response.data;
  },
  getById: async (id) => {
    const response = await apiClient.get(`/clients/${id}`);
    return response.data;
  },
  create: async (data) => {
    const response = await apiClient.post('/clients/', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await apiClient.put(`/clients/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await apiClient.delete(`/clients/${id}`);
    return response.data;
  },
};

export const animalService = {
  getAll: async () => {
    const response = await apiClient.get('/animals/');
    return response.data;
  },
  getById: async (id) => {
    const response = await apiClient.get(`/animals/${id}`);
    return response.data;
  },
  create: async (data) => {
    const response = await apiClient.post('/animals/', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await apiClient.put(`/animals/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await apiClient.delete(`/animals/${id}`);
    return response.data;
  },
};
