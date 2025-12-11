// src/ai/gemini.agent.ts
import { GoogleGenAI, Tool, Type } from '@google/genai';
import axios from 'axios';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'traerTodosLosProductos',
        description: 'Retorna todos los productos disponibles',
        parameters: {
          type: Type.OBJECT,
          properties: {},
        },
      },
      {
        name: 'buscarProductos',
        description: 'Busca productos por tipo, color o talla',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING },
          },
          required: ['query'],
        },
      },
      {
        name: 'productoPorId',
        description: 'Obtiene un producto por su ID',
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.INTEGER },
          },
          required: ['id'],
        },
      },
      {
        name: 'crearCarrito',
        description: 'Crea un carrito con un producto y cantidad',
        parameters: {
          type: Type.OBJECT,
          properties: {
            productoId: { type: Type.INTEGER },
            cantidad: { type: Type.INTEGER },
          },
          required: ['productoId', 'cantidad'],
        },
      },
    ],
  },
];

function extractFunctionCall(response: any) {
  const candidates = response.candidates || [];
  for (const c of candidates) {
    const contents = c.content || [];
    for (const part of contents) {
      if (part.functionCall) return part.functionCall;
      if (part.parts) {
        for (const p of part.parts) {
          if (p.functionCall) return p.functionCall;
        }
      }
    }
  }
  return null;
}

export class GeminiAgent {
  private ai: GoogleGenAI;
  private backendUrl = process.env.BACKEND_URL!;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Envía el historial y el mensaje del usuario al agente.
   * El agente decide si llamar a una función declarada en `tools`.
   * Si el agente pide una función, la ejecutamos contra el backend y
   * reenviamos la respuesta de la función al chat para que el agente
   * genere la respuesta final (SIEMPRE el agente redacta la respuesta).
   */
  public async sendMessage(history: ChatMessage[], userMessage: string) {
    const chat = this.ai.chats.create({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: `
          Eres un agente de ventas profesional, amable e inteligente.

          Comportamiento:
          - Interpreta la intención del usuario y decide qué función (si corresponde) llamar:
            - traerTodosLosProductos()
            - buscarProductos({ query })
            - productoPorId({ id })
            - crearCarrito({ productoId, cantidad })
          - NUNCA inventes productos: usa únicamente los datos que devuelve el backend.
          - Después de ejecutar la función, reenvía el resultado al modelo como "functionResponse"
            y permite que el agente redacte la respuesta final al usuario.
          - Formato de lista que debe ofrecer el agente:
            • ID X - TipoPrenda (Talla, Color) - $Precio_50_U
          - Mantén las respuestas cortas, útiles y conversacionales.
        `,
        tools,
      },
      history: history.map((h) => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    // 1) enviar el mensaje del usuario
    const response = await chat.sendMessage({ message: userMessage });

    // 2) buscar si el agente pidió ejecutar una función (functionCall)
    const funcCall = extractFunctionCall(response);

    if (funcCall) {
      const { name, args } = funcCall;

      try {
        let data: any = null;

        switch (name) {
          case 'traerTodosLosProductos': {
            const res = await axios.get(`${this.backendUrl}/products`);
            data = res.data;
            break;
          }

          case 'buscarProductos': {
            const query = (args && (args.query || args.q || args.search)) || '';
            const res = await axios.get(
              `${this.backendUrl}/products?q=${encodeURIComponent(query)}`,
            );
            data = res.data;
            break;
          }

          case 'productoPorId': {
            const id = args && (args.id || args.productoId || args.productId);
            const res = await axios.get(`${this.backendUrl}/products/${id}`);
            data = res.data;
            break;
          }

          case 'crearCarrito': {
            const productoId =
              args && (args.productoId || args.productId || args.id);
            const cantidad =
              args && (args.cantidad || args.qty || args.quantity || 1);
            const res = await axios.post(`${this.backendUrl}/cart`, {
              productoId,
              cantidad,
            });
            data = res.data;
            break;
          }

          default:
            return 'Función solicitada no reconocida.';
        }

        // 3) reenviar la respuesta de la función al chat para que el agente la procese
        const followUp = await chat.sendMessage({
          message: [
            {
              functionResponse: {
                name,
                response: data,
              },
            },
          ],
        });

        // 4) devolver la respuesta final generada por el agente
        return (
          followUp.text ?? 'El agente no pudo generar una respuesta final.'
        );
      } catch (err: any) {
        console.error(
          'Error ejecutando función solicitada por el agente:',
          err?.message || err,
        );
        return 'Hubo un error al ejecutar la acción solicitada. Intentá nuevamente.';
      }
    }

    // 5) si no pidió función, devolver la respuesta textual directa del agente
    return response.text ?? 'No pude procesar tu mensaje.';
  }
}
