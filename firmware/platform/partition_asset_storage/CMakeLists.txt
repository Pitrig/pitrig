idf_component_register(
  SRCS "src/partition_asset_storage.cpp"
  INCLUDE_DIRS "include"
  REQUIRES asset_storage
  PRIV_REQUIRES esp_partition)
