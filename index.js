import { Agent } from "./agent/index.js";
import {
  PinataStorageProvider,
  SwarmStorageProvider,
  BaseStorageProvider,
} from "./storage/index.js";
import { DataAccessProvider, TacoAccessProvider } from "./data-access/index.js";

export {
  Agent,
  PinataStorageProvider,
  SwarmStorageProvider,
  BaseStorageProvider,
  DataAccessProvider,
  TacoAccessProvider,
};

export default {
  Agent,
  BaseStorageProvider,
  PinataStorageProvider,
  SwarmStorageProvider,
  DataAccessProvider,
  TacoAccessProvider,
};
