idf_component_register(
  SRCS "src/dashboard_composition.cpp"
       "src/dashboard_incremental.cpp"
       "src/dashboard_assets.cpp"
       "src/dashboard_screens.cpp"
       "src/screens_overflow.cpp"
       "src/screens_z_order.cpp"
  INCLUDE_DIRS "include"
  PRIV_REQUIRES configuration_contract dashboard display esp_lvgl_port event_bus
                font_assets image_assets logger lvgl__lvgl module_composition
                overlays pitrig_config telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
