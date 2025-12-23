export interface EntityType {
    name: string;
    properties: { name: string; type: string; label?: string }[];
}

export function parseMetadata(xml: string): EntityType[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    const entityTypes: EntityType[] = [];

    const schema = doc.getElementsByTagName("Schema")[0] || doc.getElementsByTagName("edmx:Schema")[0];
    if (!schema) return [];

    const entities = doc.getElementsByTagName("EntityType");

    for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const name = entity.getAttribute("Name") || "Unknown";
        const props: { name: string; type: string; label?: string }[] = [];

        const properties = entity.getElementsByTagName("Property");
        for (let j = 0; j < properties.length; j++) {
            const prop = properties[j];
            props.push({
                name: prop.getAttribute("Name") || "",
                type: prop.getAttribute("Type") || "",
                label: prop.getAttribute("sap:label") || undefined
            });
        }

        entityTypes.push({ name, properties: props });
    }

    return entityTypes;
}
