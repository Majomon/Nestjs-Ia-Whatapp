import {
  GoogleGenAI,
  FunctionDeclaration,
  Tool,
  Type,
  Content,
  Part,
} from '@google/genai';
import axios from 'axios';

const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'getProducts',
        description: 'Busca productos con query, límite y offset.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Búsqueda opcional' },
            limit: { type: Type.INTEGER, description: 'Cantidad de productos' },
            offset: {
              type: Type.INTEGER,
              description: 'Offset para paginación',
            },
          },
          required: [],
        },
      },
      {
        name: 'getProductDetail',
        description: 'Obtiene detalle de un producto por ID',
        parameters: {
          type: Type.OBJECT,
          properties: { id: { type: Type.INTEGER } },
          required: ['id'],
        },
      },
    ],
  },
];

export class GeminiAgent {
  private ai: GoogleGenAI;
  private modelName = 'gemini-2.5-flash';
  private backendUrl =
    process.env.BACKEND_URL || 'https://desafio-laburen-vgux.onrender.com';

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async sendMessage(
    history: { role: 'user' | 'model'; text: string }[],
    userMessage: string,
  ) {
    // Mapea el historial correctamente respetando los roles
    const historyContent: Content[] = history.map((h) => ({
      role: h.role, // 'user' o 'model'
      parts: [{ text: h.text }],
    }));

    const pastHistory = historyContent.slice(0, -1); // Todo menos el último

    const chat = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction:
          'Eres un asistente de ventas. Usa herramientas para pedir info de productos.',
        tools: tools,
      },
      history: pastHistory,
    });

    let response = await chat.sendMessage({ message: userMessage });

    // Detectar si el modelo quiere llamar a una función
    if (response.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
      const funcCall = response.candidates[0].content.parts[0].functionCall!;
      let result;

      if (funcCall.name === 'getProducts') {
        const { query = '', limit = 10, offset = 0 } = funcCall.args as any;
        const { data } = await axios.get(
          `${this.backendUrl}/products?q=${query}&limit=${limit}&offset=${offset}`,
        );
        result = { products: data };
      }

      if (funcCall.name === 'getProductDetail') {
        const { id } = funcCall.args as any;
        const { data } = await axios.get(`${this.backendUrl}/products/${id}`);
        result = { product: data };
      }

      // Enviar el resultado de vuelta al modelo para generar respuesta
      response = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: funcCall.name,
              response: result,
            },
          },
        ] as Part[],
      });
    }

    return response.text;
  }
}
