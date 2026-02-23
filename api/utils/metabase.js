import axios from 'axios';

export async function getMetabaseToken() {
    const baseUrl = process.env.METABASE_BASE_URL;
    const username = process.env.METABASE_USERNAME;
    const password = process.env.METABASE_PASSWORD;

    const response = await axios.post(`${baseUrl}/api/session`, {
        username,
        password,
    });

    return response.data.id;
}

export async function queryMetabase(token, questionId, userId) {
    const baseUrl = process.env.METABASE_BASE_URL;

    // First get the card info to get the raw query
    const cardResponse = await axios.get(`${baseUrl}/api/card/${questionId}`, {
        headers: { 'X-Metabase-Session': token }
    });

    const card = cardResponse.data;

    const datasetPayload = {
        database: card.database_id,
        type: "native",
        native: {
            query: card.dataset_query.native.query,
            "template-tags": card.dataset_query.native["template-tags"]
        },
        parameters: [
            {
                type: "number",
                target: ["variable", ["template-tag", "filtro_usuario"]],
                "value": [userId]
            }
        ]
    };

    const response = await axios.post(`${baseUrl}/api/dataset`, datasetPayload, {
        headers: { 'X-Metabase-Session': token }
    });

    return response.data;
}
