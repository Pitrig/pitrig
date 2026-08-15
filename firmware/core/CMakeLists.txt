idf_component_register(
  SRCS "src/simcore.cpp"
  INCLUDE_DIRS "include"
  PRIV_REQUIRES board_registry communication configuration dashboard_composition
                display event_bus external_memory
                font_assets logger nvs_config_storage
                module_manager partition_font_asset_storage performance
                module_composition simcore_config telemetry
                telemetry_transport)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
