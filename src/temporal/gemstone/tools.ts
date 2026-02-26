import { GetPlayerDetails } from "./tools/GetPlayerDetails";
import { HennosBaseTool } from "../../tools/BaseTool";
import { GetPlayerDetailsById } from "./tools/GetPlayerDetailsById";
import { SearchPlayers } from "./tools/SearchPlayers";
import { GetPlayerGroups } from "./tools/GetPlayerGroups";
import { GetGroupDetailsById } from "./tools/GetGroupDetailsById";
import { BraveSearch } from "../../tools/BraveSearch";

export const tools: HennosBaseTool[] = [
    GetPlayerDetails,
    GetPlayerDetailsById,
    SearchPlayers,
    GetPlayerGroups,
    GetGroupDetailsById,
    BraveSearch
];
