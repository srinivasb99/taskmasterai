import axios from 'axios';

export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'Missing "url" query parameter' });
    }

    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
        });

        // Set appropriate headers
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(response.data);
    } catch (error) {
        res.status(500).json({ error: `Error fetching the URL: ${error.message}` });
    }
}
