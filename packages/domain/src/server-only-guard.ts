// Falla en tiempo de ejecución si este código llega al navegador.
if (typeof window !== "undefined") {
  throw new Error("@insedu/domain/server no puede importarse en el cliente");
}
export {};
