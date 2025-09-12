import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import path from 'path';
import 'dotenv/config';

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const bucketName = process.env.AWS_BUCKET_NAME;

export async function findFileAndGetSignedUrl(pasta, nomeProtocolo) {
    // Lista todos os objetos na pasta da data (ex: '2024/06/03/')
    const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${pasta}/`,
    });

    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Encontra o primeiro arquivo cujo nome base corresponde ao do protocolo
        const arquivoEncontrado = listResponse.Contents.find(obj => {
            const nomeBaseNaChave = path.parse(obj.Key).name.toLowerCase();
            const termoBuscado = nomeProtocolo.toLowerCase();
            return nomeBaseNaChave.includes(termoBuscado);
        });

        if (!arquivoEncontrado) return null;

        const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: arquivoEncontrado.Key,
        });

        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
        const nomeParaDownload = path.basename(arquivoEncontrado.Key);

        return { downloadUrl, nomeParaDownload };
    }

    return null;
}