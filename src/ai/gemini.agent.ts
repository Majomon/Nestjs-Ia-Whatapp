import { GoogleGenAI, Tool, Type, Content, Part } from '@google/genai';
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
  ): Promise<string> {
    // 1. Convertimos tu historial simple al formato de Google Content[]
    const historyContent: Content[] = history.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    }));

    // 2. Quitamos el último mensaje para no duplicarlo, ya que se envía en 'message'
    // (Nota: Si tu lógica en el service ya agrega el mensaje al historial antes de llamar,
    //  necesitas enviarlo separado o usar history completo, aquí asumimos lo segundo).
    const pastHistory = historyContent.slice(0, -1);

    const chat = this.ai.chats.create({
      model: this.modelName,
      config: {
        systemInstruction:
          'Eres un asistente de ventas. Usa herramientas para pedir info de productos. Muestra precios y detalles amablemente.',
        tools: tools,
      },
      history: pastHistory,
    });

    let response = await chat.sendMessage({ message: userMessage });

    // 3. Detectar si el modelo quiere llamar a una función
    if (response.candidates?.[0]?.content?.parts?.[0]?.functionCall) {
      const funcCall = response.candidates[0].content.parts[0].functionCall!;
      let result;

      console.log('🤖 Llamando herramienta:', funcCall.name);

      try {
        if (funcCall.name === 'getProducts') {
          const { query = '', limit = 10, offset = 0 } = funcCall.args as any;
          const { data } = await axios.get(
            `${this.backendUrl}/products?q=${query}&limit=${limit}&offset=${offset}`,
          );
          // CORRECCIÓN CRÍTICA: Envolvemos el array en un objeto
          result = { products: data };
        }

        if (funcCall.name === 'getProductDetail') {
          const { id } = funcCall.args as any;
          const { data } = await axios.get(`${this.backendUrl}/products/${id}`);
          result = { product: data };
        }
      } catch (error) {
        console.error('Error llamando al backend:', error);
        result = { error: 'No se pudo obtener la información.' };
      }

      // 4. Enviar el resultado de vuelta al modelo
      response = await chat.sendMessage({
        message: [
          {
            functionResponse: {
              name: funcCall.name,
              response: result, // Ahora es un objeto JSON válido
            },
          },
        ] as Part[],
      });
    }

    // 5. Retornar texto seguro (evita undefined)
    return response.text ?? 'Lo siento, no pude generar una respuesta.';
  }
}
