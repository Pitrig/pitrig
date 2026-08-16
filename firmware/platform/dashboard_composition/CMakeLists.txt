idf_component_register(
  SRCS "src/dashboard_composition.cpp"
  INCLUDE_DIRS "include"
  REQUIRES configuration_contract dashboard event_bus font_assets
           image_assets
           module_composition telemetry transport
  PRIV_REQUIRES display esp_lvgl_port logger lvgl__lvgl simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
