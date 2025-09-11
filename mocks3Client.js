import {
  ListObjectsV2Command
} from "@aws-sdk/client-s3";
import {
  getSignedUrl
} from "@aws-sdk/s3-request-presigner";

// Simula os dados de resposta do bucket
const mockBucketContents = [{
  Key: 'gravacoes-ligacao/2025-09-11/protocolo-12345.mp3'
}];

// Mock da classe S3Client
class MockS3Client {
  send(command) {
    if (command instanceof ListObjectsV2Command) {
      // Simula a resposta de sucesso
      return {
        Contents: mockBucketContents
      };
    }
    // Você pode adicionar outras simulações para diferentes comandos se precisar
    return {};
  }
}

// Mock da função getSignedUrl
const mockGetSignedUrl = (client, command, options) => {
  const {
    Key
  } = command;
  // Simula a URL pré-assinada
  return `http://mock-s3-bucket/download-link?key=${Key}`;
};

export {
  MockS3Client,
  mockGetSignedUrl as getSignedUrl
};