idf_component_register(
  SRCS "src/simcore.cpp"
  INCLUDE_DIRS "include"
  PRIV_REQUIRES board_registry communication configuration display event_bus
                font_assets logger nvs_config_storage
                module_manager partition_font_asset_storage performance
                runtime_composition simcore_config telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
