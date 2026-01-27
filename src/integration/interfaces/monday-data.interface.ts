export interface MondayColumnValue {
    id: string;
    text: string;
    value: string | null;
}

export interface MondayItem {
    id: string;
    name: string;
    column_values: MondayColumnValue[];
}

export interface MondayBoardData {
    items_page: {
        items: MondayItem[];
    };
}
