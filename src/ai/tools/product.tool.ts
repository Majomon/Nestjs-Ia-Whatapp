export const searchProductsTool = {
  name: 'searchProducts',
  description: 'Buscar productos en la base de datos.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
    },
    required: ['query'],
  },
};
