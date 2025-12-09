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

  async sendMessage(history: string[], userMessage: string) {
    const chat = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction:
          'Eres un asistente de ventas. Usa herramientas para pedir info de productos.',
        tools: tools,
      },
      history: history.map(
        (h) => ({ role: 'user', parts: [{ text: h }] }) as Content,
      ),
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
        result = data;
      }

      if (funcCall.name === 'getProductDetail') {
        const { id } = funcCall.args as any;
        const { data } = await axios.get(`${this.backendUrl}/products/${id}`);
        result = data;
      }

      // Enviar el resultado de vuelta al modelo para generar respuesta
      response = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: funcCall.name,
              response: result,
              id: funcCall.id,
            },
          },
        ] as Part[],
      });
    }

    return response.text;
  }
}
