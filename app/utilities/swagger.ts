import swaggerJsdoc from "swagger-jsdoc";

export const getSwaggerSpec = () => {
  const options = {
    definition: {
      openapi: "3.0.0",
      info: {
        title: "Langpal API",
        version: "1.0.0",
        description: "API documentation for Langpal services",
      },
      servers: [
        {
          url: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
          description: "API server",
        },
      ],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
            description: "API key for authentication",
          },
        },
      },
      security: [
        {
          ApiKeyAuth: [],
        },
      ],
    },
    apis: ["./src/app/api/**/*.ts"],
  };

  return swaggerJsdoc(options);
};
