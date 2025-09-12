import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import 'dotenv/config';

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const bucketName = process.env.AWS_BUCKET_NAME;

export async function findFileAndGetSignedUrl(pasta, nomeArquivo) {
    const keyDoArquivo = `${pasta}/${nomeArquivo}`;

    const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: keyDoArquivo,
        MaxKeys: 1
    });

    const listResponse = await s3Client.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.some(obj => obj.Key === keyDoArquivo)) {
        const getCommand = new GetObjectCommand({
            Bucket: bucketName,
            Key: keyDoArquivo,
        });

        const downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

        return { downloadUrl, nomeParaDownload: nomeArquivo };
    }

    return null;
}