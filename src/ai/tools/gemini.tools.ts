import { Tool, Type } from '@google/genai';

export const geminiTools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: 'getProducts',
                description: 'Busca productos reales en el backend usando un término interpretado del usuario.',
                parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } } },
            },
            {
                name: 'getProductById',
                description: 'Obtiene un solo producto por su ID.',
                parameters: {
                    type: Type.OBJECT,
                    properties: { id: { type: Type.NUMBER } },
                    required: ['id'],
                },
            },
            {
                name: 'addToCart',
                description: 'Agrega un producto al carrito por ID y cantidad',
                parameters: {
                    type: Type.OBJECT,
                    properties: { id: { type: Type.NUMBER }, qty: { type: Type.NUMBER } },
                    required: ['id', 'qty'],
                },
            },
            {
                name: 'viewCart',
                description: 'Muestra los productos actuales en el carrito del usuario',
                parameters: { type: Type.OBJECT, properties: {} },
            },
            {
                name: 'updateCartItem',
                description: 'Actualiza la cantidad de un producto en el carrito',
                parameters: {
                    type: Type.OBJECT,
                    properties: { id: { type: Type.NUMBER }, qty: { type: Type.NUMBER } },
                    required: ['id', 'qty'],
                },
            },
        ],
    },
];